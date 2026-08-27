import { NextResponse } from "next/server";
import { generatePatch } from "@/lib/pipeline";
import { savePatch, listPatchVersions } from "@/lib/store";
import { requireSession, acquireGenLock, releaseGenLock } from "@/lib/guard";
import { ensureFreshSession } from "@/lib/mcp";
import { sessionSetCookies } from "@/lib/session";

/**
 * GET /api/patch/stream?from&to — SSE pipeline progress (session-gated).
 * Emits: {type:"stage",s} · {type:"done",url} (owner) · {type:"done",preview,patch} (guest) · {type:"error",message}
 *
 * Credit-safety: EventSource auto-reconnects on a dropped stream; a reconnect here would
 * re-run a credit-spending pipeline. Owner runs cache the done-frame per window for 2 min —
 * an auto-retry replays it and spends nothing. Guest runs are archived nowhere, so the
 * auto-retry simply re-runs (the visitor spends their own org's credits by consent).
 */
const recentDone = new Map<string, { url: string; version: string; at: number }>();

function sseResponse(
  build: (send: (o: Record<string, unknown>) => void) => Promise<void>,
  onCancel?: () => void,
  extraCookies: string[] = []
) {
  const stream = new ReadableStream({
    async start(c) {
      const send = (o: Record<string, unknown>) => c.enqueue(`data: ${JSON.stringify(o)}\n\n`);
      try { await build(send); } finally { c.close(); }
    },
    cancel() { onCancel?.(); },
  });
  const res = new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
  for (const c of extraCookies) res.headers.append("Set-Cookie", c);
  return res;
}

export async function GET(req: Request) {
  const gate = await requireSession("GET");
  if (gate instanceof NextResponse) return gate;
  const { ctx } = gate;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return Response.json({ error: "from and to must be YYYY-MM-DD" }, { status: 400 });
  }
  if (from > to || new Date(to).getTime() - new Date(from).getTime() > 90 * 864e5) {
    return Response.json({ error: "from ≤ to, span ≤ 90 days" }, { status: 400 });
  }

  // refresh BEFORE the stream starts — SSE responses can't set cookies once open
  try { await ensureFreshSession(ctx); }
  catch { return Response.json({ error: "FanBase session expired — hit Connect again" }, { status: 401 }); }
  const cookieHeaders = ctx.dirty ? sessionSetCookies(ctx.rec) : [];

  if (ctx.isOwner) {
    const windowKey = `${from}→${to}`;
    for (const [k, v] of recentDone) if (Date.now() - v.at > 120_000) recentDone.delete(k);
    const prior = recentDone.get(windowKey);
    if (prior && Date.now() - prior.at < 120_000) {
      return sseResponse(async (send) => {
        send({ type: "done", url: prior.url, version: prior.version, replayed: true });
      }, undefined, cookieHeaders);
    }
  }

  const lockKey = "generate";
  if (!acquireGenLock(lockKey))
    return Response.json({ error: "a patch is already generating — wait for it to finish" }, { status: 409 });

  let version = "preview";
  if (ctx.isOwner) {
    const versions = listPatchVersions();
    version = (versions.length ? Math.max(...versions.map(Number).filter(Number.isFinite)) + 0.1 : 1).toFixed(1);
  }
  const windowKey = `${from}→${to}`;

  let finished = false;
  return sseResponse(async (send) => {
    try {
      const patch = await generatePatch({ version, from, to, ctx, onStage: (s) => send({ type: "stage", s }) });
      if (ctx.isOwner) {
        savePatch(patch);
        const url = `/patch/${version.replace(".", "_")}`;
        recentDone.set(windowKey, { url, version, at: Date.now() });
        send({ type: "done", url, version });
      } else {
        send({ type: "done", preview: true, patch });
      }
    } catch (e: any) {
      send({ type: "error", message: /Reconnect|refresh_failed|401/i.test(e?.message ?? "") ? "FanBase session expired — hit Connect again" : (e?.message ?? "generation failed") });
    } finally {
      finished = true;
      releaseGenLock(lockKey);
    }
  }, () => { if (!finished) releaseGenLock(lockKey); }, cookieHeaders);
}
