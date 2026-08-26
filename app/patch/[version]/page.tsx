import { loadPatch, previousVersion, listPatchVersions } from "@/lib/store";
import { diffPatches } from "@/lib/pipeline";
import { isConnected } from "@/lib/auth";
import PatchNotes from "@/components/PatchNotes";
import DraftActions from "@/components/DraftActions";
import ThemeToggle from "@/components/ThemeToggle";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function PatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ version: string }>;
  searchParams: Promise<{ vs?: string }>;
}) {
  const [{ version: rawVersion }, sp] = await Promise.all([params, searchParams]);
  const version = rawVersion.replace("_", ".");
  const patch = loadPatch(version);
  if (!patch) return notFound();

  // compare target: explicit ?vs=… else the previous patch in the archive
  const all = listPatchVersions();
  const vsV = (sp.vs ?? previousVersion(patch.version) ?? "").replace("_", ".") || null;
  const prev = vsV && vsV !== patch.version ? loadPatch(vsV) : null;
  const diff = prev ? diffPatches(prev, patch) : undefined;

  // momentum derived from the comparison patch (live patches don't store it)
  const view = prev
    ? {
        ...patch,
        champions: patch.champions.map((c) => {
          const old = prev.champions.find((p) => p.name === c.name);
          return { ...c, momentum: c.momentum ?? (old ? old.rank - c.rank : undefined) };
        }),
      }
    : patch;

  return (
    <main className="min-h-screen bg-void bg-grid">
      <nav className="sticky top-0 z-10 border-b border-line/60 bg-void/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="font-display text-sm font-bold tracking-[0.25em] text-zinc-300 hover:text-white transition">
            📋 PATCH NOTES
          </Link>
          <div className="flex items-center gap-1.5">
            {all.map((v) => (
              <Link
                key={v}
                href={`/patch/${v.replace(".", "_")}`}
                className={`rounded-lg px-2.5 py-1 font-display text-sm font-bold transition ${
                  v === patch.version ? "bg-brand/20 text-brand-soft" : "text-zinc-500 hover:text-zinc-200"
                }`}
              >
                v{v}
              </Link>
            ))}
            <span className="mx-1 h-4 w-px bg-line" />
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <PatchNotes
        patch={view}
        diff={diff}
        actions={isConnected() ? <DraftActions version={patch.version} /> : undefined}
      />

      {all.length > 1 && (
        <div className="mx-auto max-w-3xl px-6 pb-6">
          <p className="text-[11px] text-zinc-600">
            Compare with:{" "}
            {all.filter((v) => v !== patch.version).map((v) => (
              <Link key={v} href={`/patch/${patch.version.replace(".", "_")}?vs=${v.replace(".", "_")}`}
                className={`mx-1 font-semibold ${v === vsV ? "text-gold" : "text-brand-soft hover:text-zinc-100"}`}>
                v{v}
              </Link>
            ))}
          </p>
        </div>
      )}
    </main>
  );
}
