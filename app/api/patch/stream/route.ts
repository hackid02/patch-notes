import { generatePatch } from "@/lib/pipeline";
import { savePatch, listPatchVersions } from "@/lib/store";
import { requireOwner, acquireGenLock, releaseGenLock } from "@/lib/guard";

/**
 * GET /api/patch/stream?from&to — SSE pipeline progress (owner-gated).
 * Emits: {type:"stage",s} · {type:"done",url} · {type:"error",message}
 */
export async function GET(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return Response.json({ error: "from and to required" }, { status: 400 });

  const lockKey = `${from}→${to}`;
  if (!acquireGenLock(lockKey))
    return Response.json({ error: "a patch for this window is already generating" }, { status: 409 });

  const versions = listPatchVersions();
  const version = (versions.length ? Math.max(...versions.map(parseFloat)) + 0.1 : 1).toFixed(1);

  const stream = new ReadableStream({
    async start(c) {
      const send = (o: Record<string, unknown>) =>
        c.enqueue(`data: ${JSON.stringify(o)}\n\n`);
      try {
        const patch = await generatePatch({ version, from, to, onStage: (s) => send({ type: "stage", s }) });
        savePatch(patch);
        send({ type: "done", url: `/patch/${version.replace(".", "_")}`, version });
      } catch (e: any) {
        send({ type: "error", message: e?.message ?? "generation failed" });
      } finally {
        releaseGenLock(lockKey);
        c.close();
      }
    },
    cancel() { releaseGenLock(lockKey); },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
