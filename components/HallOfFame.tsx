import Link from "next/link";
import type { Patch, PatchDiff } from "@/lib/patch";

/**
 * The living series: every patch chained, fans crowned across history, diffs between releases.
 * This strip is the compounding moat made visible.
 */
export default function HallOfFame({ patches, diffs }: { patches: Patch[]; diffs: PatchDiff[] }) {
  if (!patches.length) return null;
  const diffFor = (v: string) => diffs.find((d) => d.to === v);

  return (
    <section className="relative mx-auto max-w-3xl px-6 pb-20 text-left">
      <p className="font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase text-center mb-5">
        the series · hall of fame
      </p>
      <div className="space-y-3">
        {patches.map((p) => {
          const d = diffFor(p.version);
          const top = p.champions[0];
          return (
            <Link
              key={p.version}
              href={`/patch/${p.version.replace(".", "_")}`}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-card p-4 card-hover sm:gap-5"
            >
              <span className="font-display shrink-0 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-sm font-bold text-gold">
                v{p.version}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] tracking-wider text-zinc-500 uppercase">
                  {p.window.from} → {p.window.to}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm">
                  {p.fanOfThePatch?.name ? (
                    <span className="text-zinc-200">🌟 <span className="font-semibold">{p.fanOfThePatch.name}</span></span>
                  ) : top ? (
                    <span className="text-zinc-200">🏆 <span className="font-semibold">{top.name}</span></span>
                  ) : null}
                  <span
                    className={`font-mono text-[10px] font-bold tracking-wider uppercase rounded-full px-2 py-0.5 border ${
                      p.meta.trend === "rising"
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : p.meta.trend === "cooling"
                          ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
                          : "border-zinc-500/40 bg-zinc-500/10 text-zinc-400"
                    }`}
                  >
                    {p.meta.trend}
                  </span>
                </div>
              </div>
              {d?.metaShift && (
                <span className="hidden sm:block shrink-0 font-mono text-[10px] text-zinc-500">
                  Δ {d.metaShift}
                </span>
              )}
              <span className="shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-gold">→</span>
            </Link>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-zinc-600">
        every new patch crowns a fan and diffs against the last — the series compounds
      </p>
    </section>
  );
}
