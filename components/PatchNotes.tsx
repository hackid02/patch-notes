import type { Patch, PatchDiff } from "@/lib/patch";

const platformColor: Record<string, string> = {
  x: "bg-zinc-700", discord: "bg-indigo-500", instagram: "bg-pink-500",
  tiktok: "bg-cyan-500", youtube: "bg-red-500", twitch: "bg-purple-500",
  shopify: "bg-emerald-500", whatsapp: "bg-green-500",
};
const medal = ["text-amber-300", "text-zinc-300", "text-amber-600"];
const trendStyle: Record<string, string> = {
  rising: "bg-emerald-500/10 text-emerald-300 border-emerald-500/40",
  stable: "bg-sky-500/10 text-sky-300 border-sky-500/40",
  cooling: "bg-amber-500/10 text-amber-300 border-amber-500/40",
  volatile: "bg-fuchsia-500/10 text-fuchsia-300 border-fuchsia-500/40",
  unknown: "bg-zinc-500/10 text-zinc-400 border-zinc-600",
};
const trendIcon: Record<string, string> = { rising: "▲", cooling: "▼", stable: "●", volatile: "◆", unknown: "○" };

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div className="animate-fade-up" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

function Section({ title, index, children }: { title: string; index: string; children: React.ReactNode }) {
  return (
    <section className="mt-12">
      <div className="flex items-center gap-3 mb-5">
        <span className="font-mono text-xs text-brand-soft/70">{index}</span>
        <h2 className="font-mono text-[11px] font-bold tracking-[0.3em] text-zinc-400 uppercase">{title}</h2>
        <div className="h-px flex-1 bg-gradient-to-r from-line to-transparent" />
      </div>
      {children}
    </section>
  );
}

function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name.replace(/^@/, "").slice(0, 2).toUpperCase();
  return (
    <span className={`flex items-center justify-center rounded-full bg-gradient-to-br from-brand/60 to-brand/20 font-display font-bold text-zinc-100 ${className}`}>
      {initials}
    </span>
  );
}

export default function PatchNotes({ patch, diff, actions }: { patch: Patch; diff?: PatchDiff; actions?: React.ReactNode }) {
  return (
    <article className="relative mx-auto max-w-3xl px-6 pb-16 pt-10">
      {/* ambient glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 glow-brand animate-glow-pulse" />

      {/* ===== masthead ===== */}
      <Reveal>
        <header className="relative">
          <p className="font-mono text-[11px] font-bold tracking-[0.4em] text-brand-soft uppercase">
            Community Patch Notes
          </p>
          <div className="mt-4 flex items-end justify-between gap-6 flex-wrap">
            <h1 className="font-display text-7xl tracking-tight bg-gradient-to-br from-zinc-50 via-zinc-200 to-brand-soft bg-clip-text text-transparent">
              v{patch.version}
            </h1>
            <span className={`mb-2 rounded-full border px-4 py-1.5 font-display text-sm font-semibold ${trendStyle[patch.meta.trend] ?? trendStyle.unknown}`}>
              {trendIcon[patch.meta.trend] ?? "○"} meta: {patch.meta.trend}
            </span>
          </div>
          <p className="mt-4 font-mono text-xs text-zinc-500">
            {patch.window.from} → {patch.window.to}
            {patch.balance.dataSince && <span> · KPI snapshots since {patch.balance.dataSince}</span>}
          </p>
        </header>
      </Reveal>

      {/* ===== stat cards ===== */}
      {patch.stats && (
        <Reveal delay={80}>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { n: patch.stats.fansRanked ?? 0, label: "fans ranked" },
              { n: patch.stats.questionsSurfaced ?? 0, label: "fan questions" },
              { n: patch.stats.platformsCovered ?? 0, label: "platforms read" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-line bg-card p-4 text-center card-hover">
                <p className="font-display text-3xl font-bold text-zinc-50">{s.n}</p>
                <p className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-zinc-500 uppercase">{s.label}</p>
              </div>
            ))}
          </div>
        </Reveal>
      )}

      {/* ===== diff banner ===== */}
      {diff && (
        <Reveal delay={140}>
          <div className="relative mt-6 overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent p-5">
            <div className="absolute inset-y-0 left-0 w-1 bg-gold/70" />
            <p className="text-[10px] font-bold tracking-[0.25em] text-gold/80 uppercase">Δ patch diff — vs v{diff.from}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-zinc-200">
              {diff.metaShift && <span>🧭 meta shifted <span className="font-semibold text-gold">{diff.metaShift}</span></span>}
              {diff.biggestRiser && <span>🚀 <span className="font-semibold text-gold">{diff.biggestRiser.name}</span> climbed {diff.biggestRiser.places} spots</span>}
              {diff.newChampions.length > 0 && <span>✨ new: {diff.newChampions.slice(0, 3).join(", ")}</span>}
              {diff.buffsResolved.length > 0 && <span>✅ {diff.buffsResolved.length} nerf(s) resolved</span>}
              {diff.newNerfs.length > 0 && <span>⚠️ {diff.newNerfs.length} new nerf(s)</span>}
            </div>
          </div>
        </Reveal>
      )}

      {/* ===== meta report ===== */}
      <Reveal delay={200}>
        <Section index="01" title="📡 Meta Report">
          <p className="text-lg leading-relaxed text-zinc-200">{patch.meta.summary}</p>
          <div className="mt-5 space-y-2.5">
            {patch.meta.drivers.map((d, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-line bg-card px-4 py-3 card-hover">
                <span className={`font-display text-lg font-bold ${d.direction === "positive" ? "text-emerald-400" : "text-rose-400"}`}>
                  {d.direction === "positive" ? "+" : "−"}
                </span>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">{d.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{d.detail}</p>
                </div>
              </div>
            ))}
          </div>
          {patch.meta.recurringQuestions.length > 0 && (
            <div className="mt-5 rounded-2xl border border-brand/25 bg-brand/5 p-5">
              <p className="text-[10px] font-bold tracking-[0.25em] text-brand-soft uppercase mb-3">Fans keep asking</p>
              <div className="space-y-1.5">
                {patch.meta.recurringQuestions.map((q, i) => (
                  <p key={i} className="text-sm text-zinc-300">“{q}”</p>
                ))}
              </div>
              {patch.meta.recommendedActions.length > 0 && (
                <p className="mt-4 border-t border-brand/20 pt-3 text-xs text-zinc-400">
                  <span className="font-semibold text-brand-soft">Recommended: </span>
                  {patch.meta.recommendedActions[0]}
                </p>
              )}
            </div>
          )}
        </Section>
      </Reveal>

      {/* ===== balance changes ===== */}
      <Reveal delay={260}>
        <Section index="02" title="⚖️ Balance Changes">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/10 to-transparent p-5 card-hover">
              <p className="text-[10px] font-bold tracking-[0.25em] text-emerald-400 uppercase mb-4">▲ Buffs</p>
              {patch.balance.buffs.length === 0 && <p className="text-sm text-zinc-500">No significant gains this window.</p>}
              {patch.balance.buffs.map((b, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p className="font-display text-2xl font-bold text-emerald-300">{b.delta}</p>
                  <p className="text-xs font-semibold text-zinc-300">{b.metric} · {b.platform}</p>
                  {b.note && <p className="text-[11px] text-zinc-500">{b.note}</p>}
                </div>
              ))}
            </div>
            <div className="rounded-2xl border border-rose-500/25 bg-gradient-to-b from-rose-500/10 to-transparent p-5 card-hover">
              <p className="text-[10px] font-bold tracking-[0.25em] text-rose-400 uppercase mb-4">▼ Nerfs</p>
              {patch.balance.nerfs.length === 0 && <p className="text-sm text-zinc-500">Nothing slipped. Clean patch.</p>}
              {patch.balance.nerfs.map((b, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p className="font-display text-2xl font-bold text-rose-300">{b.delta}</p>
                  <p className="text-xs font-semibold text-zinc-300">{b.metric} · {b.platform}</p>
                  {b.note && <p className="text-[11px] text-zinc-500">{b.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </Section>
      </Reveal>

      {/* ===== rising champions ===== */}
      <Reveal delay={320}>
        <Section index="03" title="🏆 Rising Champions">
          <ol className="overflow-hidden rounded-2xl border border-line">
            {patch.champions.map((c, i) => (
              <li
                key={c.clusterId + c.rank}
                className={`flex items-center gap-4 px-5 py-3.5 ${i % 2 ? "bg-panel" : "bg-card"} ${c.rank === 1 ? "bg-gradient-to-r from-gold/10 to-transparent" : ""}`}
              >
                <span className={`w-7 text-center font-display text-lg font-bold ${medal[c.rank - 1] ?? "text-zinc-600"}`}>{c.rank}</span>
                <Avatar name={c.name} className="h-9 w-9 text-xs" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-zinc-100 truncate">{c.name}</span>
                    {c.tier && <span className="rounded bg-gold/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold">{c.tier}</span>}
                  </div>
                  <div className="mt-1 flex gap-1">
                    {c.platforms.map((p) => (
                      <span key={p} className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase text-white ${platformColor[p] ?? "bg-zinc-600"}`}>{p}</span>
                    ))}
                  </div>
                </div>
                {typeof c.momentum === "number" && c.momentum !== 0 && (
                  <span className={`font-display text-xs font-bold ${c.momentum > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {c.momentum > 0 ? `▲${c.momentum}` : `▼${Math.abs(c.momentum)}`}
                  </span>
                )}
                <span className="font-mono text-sm text-zinc-500 w-10 text-right">{c.score}</span>
              </li>
            ))}
          </ol>
        </Section>
      </Reveal>

      {/* ===== fan of the patch ===== */}
      {patch.fanOfThePatch && (
        <Reveal delay={380}>
          <Section index="04" title="👑 Fan of the Patch">
            <div className="relative overflow-hidden rounded-2xl border border-gold/30 bg-gradient-to-b from-gold/10 via-card to-card p-6">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 glow-gold" />
              <div className="flex items-center gap-4">
                <Avatar name={patch.fanOfThePatch.name} className="h-14 w-14 text-lg ring-2 ring-gold/50" />
                <div>
                  <p className="font-display text-2xl font-bold text-gold">{patch.fanOfThePatch.name}</p>
                  <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase">crowned this patch</p>
                </div>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-zinc-300">{patch.fanOfThePatch.why}</p>
              <ol className="mt-5 space-y-0">
                {patch.fanOfThePatch.arc.map((a, i) => (
                  <li key={i} className="relative flex gap-4 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <span className="mt-1 h-2.5 w-2.5 rounded-full bg-gold/80 ring-4 ring-gold/15" />
                      {i < patch.fanOfThePatch!.arc.length - 1 && <span className="w-px flex-1 bg-gradient-to-b from-gold/40 to-transparent" />}
                    </div>
                    <div className="pb-1">
                      <p className="font-mono text-[11px] text-gold/70">{a.when}</p>
                      <p className="text-sm text-zinc-300">{a.event}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </Section>
        </Reveal>
      )}

      {/* ===== treasury ===== */}
      {patch.treasury && (
        <Reveal delay={420}>
          <Section index="05" title="💰 Treasury">
            <div className="rounded-2xl border border-line bg-card p-5 card-hover">
              <span className="font-display text-3xl font-bold text-zinc-50">{patch.treasury.lapsedBuyers}</span>{" "}
              <span className="text-sm text-zinc-400">{patch.treasury.note}</span>
            </div>
          </Section>
        </Reveal>
      )}

      {/* ===== drafts awaiting approval ===== */}
      <Reveal delay={460}>
        <Section index="06" title="📣 Announcement — awaiting your approval">
          <div className="grid gap-4 lg:grid-cols-2">
            {patch.announcement.x && (
              <div className="rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-black text-zinc-950">𝕏</span>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-500 uppercase">X draft</p>
                </div>
                <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-zinc-200">{patch.announcement.x}</pre>
              </div>
            )}
            {patch.announcement.discordEmbed && (
              <div className="rounded-2xl border border-line bg-[#2b2d31] p-5">
                <p className="text-[10px] font-bold tracking-[0.2em] text-zinc-400 uppercase mb-3">Discord embed draft</p>
                <div className="rounded-lg border-l-4 border-brand bg-[#313338] p-4">
                  <p className="font-display text-sm font-bold text-zinc-100">{patch.announcement.discordEmbed.title}</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-zinc-300">{patch.announcement.discordEmbed.description}</p>
                  <div className="mt-3 space-y-2">
                    {(patch.announcement.discordEmbed.fields ?? []).map((f, i) => (
                      <div key={i}>
                        <p className="text-[10px] font-bold text-zinc-200">{f.name}</p>
                        <p className="text-xs text-zinc-400">{f.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-zinc-500">Drafted in your brand voice. Nothing posts until you approve it.</p>
          {actions}
        </Section>
      </Reveal>

      {/* ===== receipt & guardrails ===== */}
      <Reveal delay={500}>
        <footer className="mt-14 rounded-2xl border border-line bg-panel p-5">
          {patch.provenance && patch.provenance.length > 0 && (
            <>
              <p className="text-[10px] font-bold tracking-[0.25em] text-zinc-500 uppercase mb-3">
                MCP receipt — built with {patch.provenance.length} live tool call groups
              </p>
              <div className="flex flex-wrap gap-1.5">
                {patch.provenance.map((t, i) => <span key={i} className="chip">{t}</span>)}
              </div>
            </>
          )}
          <div className="mt-4 border-t border-line pt-3 space-y-1">
            {patch.guardrails.map((g, i) => <p key={i} className="text-[11px] text-zinc-500">✓ {g}</p>)}
          </div>
          <p className="mt-4 text-[11px] text-zinc-600">
            Generated {new Date(patch.generatedAt).toLocaleString()} · <span className="font-semibold text-brand-soft">Patch Notes</span> · powered by FanBase MCP
          </p>
        </footer>
      </Reveal>
    </article>
  );
}
