import Link from "next/link";
import { cookies } from "next/headers";
import { listPatchVersions, loadPatch } from "@/lib/store";
import { hasOwnerSession } from "@/lib/auth";
import { sessionFromCookies } from "@/lib/session";
import GenerateForm from "@/components/GenerateForm";
import ThemeToggle from "@/components/ThemeToggle";
import PatchNotes from "@/components/PatchNotes";
import HallOfFame from "@/components/HallOfFame";
import { diffPatches } from "@/lib/pipeline";

const features = [
  { icon: "📡", title: "Meta Report", desc: "Cross-platform sentiment → what your community actually feels, and why." },
  { icon: "🏆", title: "Rising Champions", desc: "Real fans, ranked from live activity — with their stories, not just handles." },
  { icon: "Δ", title: "Patch Diffs", desc: "Every patch diffs against the last. It compounds — a weekly ritual, not a one-off." },
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const jar = await cookies();
  // web session (any org) OR legacy owner session (local dev)
  const connected = !!sessionFromCookies((n) => jar.get(n)?.value) || hasOwnerSession(jar.get("fb_connected")?.value);
  const readOnly = process.env.NEXT_PUBLIC_DEMO_READONLY === "1";
  // real generated series wins; on a fresh clone fall back to fixtures so the product is reachable with zero credentials
  const real = listPatchVersions();
  const usingFixtures = real.length === 0;
  const versions = usingFixtures ? ["1.0", "1.1"] : real;
  const latest = versions[versions.length - 1];
  const latestPatch = latest ? loadPatch(latest) : null;
  const series = versions.map((v) => loadPatch(v)).filter((p): p is NonNullable<typeof p> => !!p);
  const seriesDiffs = series.slice(1).map((p, i) => diffPatches(series[i], p));

  return (
    <main className="relative min-h-screen overflow-hidden bg-void bg-grid text-zinc-100">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[30rem] w-[56rem] -translate-x-1/2 glow-brand" />

      <nav className="relative mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-sm font-bold tracking-[0.25em] text-zinc-200">📋 PATCH NOTES</span>
        <div className="flex items-center gap-3">
          <span className="chip">powered by FanBase MCP</span>
          <ThemeToggle />
        </div>
      </nav>

      <div className="relative mx-auto max-w-3xl px-6 pt-14 pb-24 text-center">
        <div className="animate-fade-up">
          <p className="text-xs font-bold tracking-[0.35em] text-brand-soft uppercase">Your community is a live-service game</p>
          <h1 className="font-display mt-5 text-6xl sm:text-7xl tracking-tight leading-[1.04] bg-gradient-to-br from-zinc-50 via-zinc-200 to-brand-soft bg-clip-text text-transparent">
            Ship its <span className="italic">patch notes.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-zinc-400">
            One click turns your real FanBase data into a shareable weekly artifact —
            meta report, buffs &amp; nerfs, rising champions, fan of the patch —
            then diffed against last week.
          </p>
        </div>

        {sp.auth_error && (
          <p className="mt-8 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300 animate-fade-up">
            ⚠️ {sp.auth_error}
          </p>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-center gap-3 animate-fade-up" style={{ animationDelay: "120ms" }}>
          {readOnly ? (
            <span className="rounded-xl border border-brand/40 bg-brand/10 px-6 py-3 font-display text-sm font-bold text-brand-soft">
              👀 read-only showcase — built from a live FanBase
            </span>
          ) : connected ? (
            <span className="flex items-center gap-3">
              <span className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-6 py-3 font-display font-bold text-emerald-300">
                ✓ FanBase connected
              </span>
              <a href="/api/auth/logout" className="text-xs text-zinc-600 hover:text-zinc-300 transition underline underline-offset-2">
                disconnect
              </a>
            </span>
          ) : (
            <a
              href="/api/auth/login"
              className="rounded-xl bg-brand px-7 py-3 font-display font-bold text-white shadow-lg shadow-brand/30 hover:bg-brand-soft transition card-hover border border-brand"
            >
              Connect FanBase
            </a>
          )}
          {latest && (
            <Link
              href={`/patch/${latest.replace(".", "_")}`}
              className="rounded-xl border border-gold/50 bg-gold/10 px-7 py-3 font-display font-bold text-gold hover:bg-gold/20 transition card-hover"
            >
              View latest patch (v{latest}) →
            </Link>
          )}
        </div>

        <div className="mt-10 max-w-lg mx-auto animate-fade-up" style={{ animationDelay: "200ms" }}>
          {connected && !readOnly && <GenerateForm />}
          {!connected && !readOnly && (
            <p className="text-xs text-zinc-600">
              Connect your FanBase and generate from <span className="text-zinc-400 font-semibold">your</span> community in ~60s — free reads, ~1 skill credit, your own org's credits.
              The patches below were generated live from the owner's FanBase.
            </p>
          )}
          {readOnly && (
            <p className="text-xs text-zinc-600">
              Every patch here was generated live from the owner's FanBase — open one and check the MCP receipt at the bottom.
            </p>
          )}
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-3 text-left animate-fade-up" style={{ animationDelay: "280ms" }}>
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-line bg-card p-5 card-hover">
              <p className="font-display text-xl">{f.icon}</p>
              <p className="mt-3 font-display text-sm font-bold text-zinc-100">{f.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* the series — the compounding moat, visible at a glance */}
      {series.length > 0 && <HallOfFame patches={series} diffs={seriesDiffs} />}

      {/* show, don't tell: the artifact itself, clipped and teased */}
      {latestPatch && (
        <div className="relative mx-auto mt-8 max-w-3xl px-6 pb-20 text-left">
          <p className="font-mono text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase text-center mb-4">
            the artifact{usingFixtures ? " · sample data" : " · live from real FanBase data"}
          </p>
          <div className="relative overflow-hidden rounded-3xl border border-line bg-panel">
            <div className="max-h-[560px] overflow-hidden">
              <PatchNotes patch={latestPatch} />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-56 bg-gradient-to-t from-void via-void/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-8 flex justify-center">
              <Link
                href={`/patch/${latest.replace(".", "_")}`}
                className="pointer-events-auto rounded-xl bg-brand px-6 py-3 font-display font-bold text-white shadow-lg shadow-brand/30 hover:bg-brand-soft transition card-hover"
              >
                Read the full v{latest} patch →
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
