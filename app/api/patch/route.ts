import { NextResponse } from "next/server";
import { generatePatch } from "@/lib/pipeline";
import { savePatch, listPatchVersions } from "@/lib/store";
import { requireOwner, acquireGenLock, releaseGenLock } from "@/lib/guard";

/**
 * POST /api/patch  { from, to, version? } — non-streaming generation (owner-gated).
 * The UI uses /api/patch/stream for live progress; this stays for API completeness.
 */
export async function POST(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;

  try {
    const body = await req.json();
    const { from, to } = body;
    if (!from || !to) return NextResponse.json({ error: "from and to (ISO dates) are required" }, { status: 400 });

    const lockKey = `${from}→${to}`;
    if (!acquireGenLock(lockKey))
      return NextResponse.json({ error: "a patch for this window is already generating" }, { status: 409 });

    try {
      const versions = listPatchVersions();
      const version = body.version ?? (versions.length ? Math.max(...versions.map(parseFloat)) + 0.1 : 1).toFixed(1);
      const patch = await generatePatch({ version, from, to });
      savePatch(patch);
      return NextResponse.json({ ok: true, version, url: `/patch/${version.replace(".", "_")}` });
    } finally {
      releaseGenLock(lockKey);
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "patch generation failed" }, { status: 500 });
  }
}
