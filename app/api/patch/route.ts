import { NextResponse } from "next/server";
import { generatePatch } from "@/lib/pipeline";
import { savePatch, listPatchVersions, isValidVersion } from "@/lib/store";
import { requireSession, acquireGenLock, releaseGenLock } from "@/lib/guard";
import { ensureFreshSession } from "@/lib/mcp";
import { persistSessionIfDirty } from "@/lib/session";

/**
 * POST /api/patch  { from, to, version? } — non-streaming generation (session-gated).
 * The UI uses /api/patch/stream for live progress; this stays for API completeness.
 * Owner (local dev): archives + versions the patch. Guests (web): preview only, nothing archived.
 */
export async function POST(req: Request) {
  const gate = await requireSession("POST");
  if (gate instanceof NextResponse) return gate;
  const { ctx } = gate;

  try {
    const body = await req.json();
    const { from, to } = body;
    if (!from || !to) return NextResponse.json({ error: "from and to (ISO dates) are required" }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) ||
        from > to || new Date(to).getTime() - new Date(from).getTime() > 90 * 864e5) {
      return NextResponse.json({ error: "from/to must be YYYY-MM-DD, from ≤ to, span ≤ 90 days" }, { status: 400 });
    }
    if (body.version !== undefined && body.version !== null && !isValidVersion(body.version)) {
      return NextResponse.json({ error: "version must look like 1.2" }, { status: 400 });
    }

    await ensureFreshSession(ctx); // rotate up-front so cookies go out on THIS response

    const lockKey = "generate";
    if (!acquireGenLock(lockKey))
      return NextResponse.json({ error: "a patch is already generating — wait for it to finish" }, { status: 409 });

    try {
      let version = body.version ?? null;
      if (ctx.isOwner && !version) {
        const versions = listPatchVersions();
        version = (versions.length ? Math.max(...versions.map(Number).filter(Number.isFinite)) + 0.1 : 1).toFixed(1);
      }
      const patch = await generatePatch({ version: version ?? "preview", from, to, ctx });
      let res: NextResponse;
      if (ctx.isOwner) {
        savePatch(patch);
        res = NextResponse.json({ ok: true, version, url: `/patch/${String(version).replace(".", "_")}` });
      } else {
        res = NextResponse.json({ ok: true, preview: true, patch });
      }
      return persistSessionIfDirty(res, ctx);
    } finally {
      releaseGenLock(lockKey);
    }
  } catch (e: any) {
    const status = e?.status === 401 || /refresh_failed|Reconnect/i.test(e?.message ?? "") ? 401 : 500;
    return NextResponse.json({ error: e?.message ?? "patch generation failed" }, { status });
  }
}
