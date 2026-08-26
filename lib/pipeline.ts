/**
 * The patch engine: one window of community history -> one Patch JSON.
 *
 * HARD-WON TRUTHS (Aug 26, live account probes — see fixtures/tools-reference.md):
 *  - Responses come in BOTH content[0].text (json) and sometimes .structuredContent. Use unwrap().
 *  - query_activity / activity_summary IGNORE after/before on backfilled data: every
 *    backfilled event is stamped with the ingestion moment. We rebuild TRUE time from
 *    snowflake IDs (X & Discord IDs encode creation ms) and filter client-side.
 *  - connectionId lives in get_account_analytics({}).accounts, NOT list_platform_connections.
 *  - analytics snapshots start at connection day (no backfill) — one snapshot = no trend;
 *    fall back to activity-volume deltas computed from decoded event times.
 *  - check_skill_generation returns its payload wrapped like everything else — unwrap it.
 *  - send_inbox_message is structurally excluded from this engine. All content = drafts.
 */
import { callTool, pollJob, resetCallLog, getCallLog, unwrap } from "./mcp";
import type { Patch, PatchDiff } from "./patch";

const LIVE_PACE_MS = 1500; // ~20 calls/min budget incl. skill polls; replay mode skips pacing
const isReplay = () => process.env.FIXTURE_MODE === "replay";

export interface PatchRequest {
  version: string;
  from: string; // ISO date
  to: string;   // ISO date (exclusive end is fine either way — we filter inclusive by day)
  maxChampions?: number;
  onStage?: (msg: string) => void;
}

/* ---------- helpers ---------- */
const arr = (v: any): any[] => (Array.isArray(v) ? v : v?.items ?? v?.results ?? v?.data ?? v?.events ?? v?.accounts ?? v?.breakdown ?? v?.platforms ?? []);
const num = (v: any): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: any): string => (typeof v === "string" ? v : v?.handle ?? v?.name ?? v?.username ?? "");
const dayMs = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime();
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const inWindow = (at: number | null, from: string, to: string) =>
  at !== null && at >= dayMs(from) && at <= dayMs(to) + 864e5 - 1;

const pace = async () => { if (!isReplay()) await new Promise((r) => setTimeout(r, LIVE_PACE_MS)); };

async function safeCall(tool: string, args: Record<string, unknown>, fallback: any) {
  try { return unwrap(await callTool(tool, args)); } catch { return fallback; }
}

/* ---------- snowflake time-rebuild: the fix for FanBase's ignored window params ---------- */
const X_EPOCH = BigInt(1288834974657);
const DISCORD_EPOCH = BigInt(1420070400000);
function snowflakeMs(id: any, epoch: bigint): number | null {
  const s = typeof id === "string" ? id : id != null ? String(id) : "";
  if (!/^\d{15,22}$/.test(s)) return null;
  try { return Number(BigInt(s) >> BigInt(22)) + Number(epoch); } catch { return null; }
}

interface Ev {
  fanId: string | null;
  fan: string;
  platform: string;
  type: string;
  text: string;
  at: number | null;   // true event time, rebuilt from snowflake where possible
  rebuilt: boolean;    // true if from snowflake decode, false if fell back to createdAt
  postRef: string | null; // tweetId for x-link provenance
}

function toEv(e: any): Ev {
  const platform = str(e?.platform) || "unknown";
  const epoch = platform === "discord" ? DISCORD_EPOCH : X_EPOCH;
  const src = e?.sourceId ?? e?.metadata?.tweetId;
  const decoded = snowflakeMs(src, epoch);
  const created = Date.parse(e?.createdAt ?? "");
  return {
    fanId: e?.fan?.id ? String(e.fan.id) : null,
    fan: str(e?.fan?.name ?? e?.fan) || "unknown",
    platform,
    type: str(e?.type) || "activity",
    text: str(e?.metadata?.tweetText ?? e?.metadata?.text ?? e?.text),
    at: decoded ?? (Number.isFinite(created) ? created : null),
    rebuilt: decoded !== null,
    postRef: e?.metadata?.tweetId ?? (typeof src === "string" ? src : null),
  };
}

/** Fetch ALL activity once, paginated, then window client-side (window params are ignored). */
async function fetchAllEvents(onStage?: (s: string) => void): Promise<Ev[]> {
  const events: Ev[] = [];
  for (let page = 1; page <= 5; page++) {
    const res = await safeCall("query_activity", { limit: 100, page }, null);
    const batch = arr(res).map(toEv).filter((e) => e.at !== null || e.fan !== "unknown");
    events.push(...batch);
    const total = num(res?.total);
    const got = (page - 1) * 100 + batch.length;
    if (batch.length < 100 || (total !== null && got >= total)) break;
    await pace();
  }
  return events;
}

/* ---------- balance: KPI trends when they exist, honest activity deltas otherwise ---------- */
async function pullBalance(from: string, to: string, all: Ev[]): Promise<Patch["balance"]> {
  const balance: Patch["balance"] = { buffs: [], nerfs: [], dataSince: undefined };

  const accounts = arr((await safeCall("get_account_analytics", {}, null)) ?? []);
  for (const a of accounts) {
    const connectionId = str(a?.connectionId);
    const platform = str(a?.platform) || "unknown";
    if (!connectionId) continue;
    await pace();
    const trend = await safeCall("get_analytics_trend", { connectionId, metric: "followers", from, to }, null);
    const series = arr(trend?.series ?? trend).map((p: any) => num(p?.value)).filter((v): v is number => v !== null);
    if (trend?.firstSnapshotAt && !balance.dataSince) balance.dataSince = String(trend.firstSnapshotAt).slice(0, 10);
    if (series.length >= 2 && series[0] !== 0) {
      const pct = ((series[series.length - 1] - series[0]) / Math.abs(series[0])) * 100;
      const entry = { metric: "followers", platform, delta: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%` };
      (pct >= 1 ? balance.buffs : pct <= -1 ? balance.nerfs : null)?.push(entry);
    }
  }

  // Activity-volume delta — always computable from rebuilt timestamps (works on day 1)
  const span = dayMs(to) - dayMs(from) + 864e5;
  const prevFrom = isoDay(dayMs(from) - span);
  const prevTo = isoDay(dayMs(from) - 864e5);
  const curr = all.filter((e) => inWindow(e.at, from, to)).length;
  const prev = all.filter((e) => inWindow(e.at, prevFrom, prevTo)).length;
  if (curr > 0 && prev > 0) {
    const pct = ((curr - prev) / prev) * 100;
    const entry = {
      metric: "community activity",
      platform: "all",
      delta: `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
      note: `${curr} vs ${prev} interactions · vs ${prevFrom}–${prevTo}`,
    };
    (pct >= 5 ? balance.buffs : pct <= -5 ? balance.nerfs : null)?.push(entry);
  }
  return balance;
}

/* ---------- champions: group window events by fan (activity_summary can't window backfill) ---------- */
function pullChampions(all: Ev[], from: string, to: string, max: number): Patch["champions"] {
  const counts = new Map<string, { name: string; platforms: Set<string>; count: number }>();
  for (const e of all.filter((x) => inWindow(x.at, from, to))) {
    if (!e.fan || e.fan === "unknown") continue;
    const key = e.fanId ?? e.fan.toLowerCase();
    const c = counts.get(key) ?? { name: e.fan, platforms: new Set<string>(), count: 0 };
    c.count++; c.platforms.add(e.platform);
    counts.set(key, c);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, max)
    .map(([key, c], i) => ({
      rank: i + 1,
      name: c.name,
      clusterId: key,
      platforms: [...c.platforms],
      score: c.count,
    }));
}

/* ---------- fan of the patch: the #1 champion's arc, quoted from their own words ---------- */
function pullFanArc(all: Ev[], champions: Patch["champions"], from: string, to: string): Patch["fanOfThePatch"] {
  const top = champions[0];
  if (!top) return undefined;
  const mine = all
    .filter((e) => inWindow(e.at, from, to) && (e.fanId === top.clusterId || e.fan.toLowerCase() === top.name.toLowerCase()))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  if (!mine.length) return undefined;
  const arc = mine.slice(0, 6).map((e) => ({
    when: isoDay(e.at!),
    event: `${e.type} on ${e.platform}: “${e.text.replace(/^@\S+\s*/, "").slice(0, 90)}${e.text.length > 90 ? "…" : ""}”`,
  }));
  const best = [...mine].sort((a, b) => b.text.length - a.text.length)[0];
  return {
    name: top.name,
    clusterId: top.clusterId,
    arc,
    why: `${top.name} led the community this window — ${mine.length} interaction${mine.length > 1 ? "s" : ""} on ${[...new Set(mine.map((e) => e.platform))].join(", ")}. Signature moment: “${best.text.replace(/^@\S+\s*/, "").slice(0, 120)}${best.text.length > 120 ? "…" : ""}”`,
  };
}

/* ---------- meta: paid sentiment skill when available, always-on comment mining otherwise ---------- */
async function pullMeta(from: string, to: string, all: Ev[]): Promise<{ meta: Patch["meta"]; derived: boolean }> {
  try {
    const job: any = await safeCall("trigger_skill", {
      skill: "sentiment-cross-platform",
      instructions: `Analyze community sentiment for ${from} to ${to}. Return trend, positive/negative drivers, recurring questions, key insights, recommended actions.`,
    }, null);
    const id = job?.executionId ?? job?.id;
    if (id) {
      await pace();
      const done: any = await pollJob("check_skill_generation", { executionId: id }, { timeoutMs: 100_000, intervalMs: 9000 });
      const a = done?.analysis ?? done?.result ?? done;
      const summary = str(a?.summary ?? a?.keyInsights ?? a?.insights);
      if (summary || arr(a?.drivers).length) {
        return {
          derived: false,
          meta: {
            trend: (str(a?.trend).toLowerCase() || "unknown") as Patch["meta"]["trend"],
            summary: summary || "Sentiment skill returned no summary for this window.",
            drivers: arr(a?.drivers).map((d: any) => ({
              label: str(d?.label ?? d).slice(0, 90),
              direction: str(d?.direction).includes("neg") ? "negative" as const : "positive" as const,
              detail: str(d?.detail ?? d).slice(0, 140),
            })),
            recurringQuestions: arr(a?.recurringQuestions ?? a?.questions).map(String).slice(0, 5),
            recommendedActions: arr(a?.recommendedActions ?? a?.actions).map(String).slice(0, 4),
          },
        };
      }
    }
  } catch { /* fall through to derived mode */ }

  // Derived mode: mine the actual community voice (works with 0 credits)
  const win = all.filter((e) => inWindow(e.at, from, to) && e.text);
  const span = dayMs(to) - dayMs(from) + 864e5;
  const prev = all.filter((e) => inWindow(e.at, isoDay(dayMs(from) - span), isoDay(dayMs(from) - 864e5))).length;
  const ratio = prev > 0 ? win.length / prev : null;
  const trend = ratio === null ? (win.length > 0 ? "rising" : "unknown") : ratio > 1.1 ? "rising" : ratio < 0.9 ? "cooling" : "stable";

  const clean = (t: string) => t.replace(/^@\S+\s*/, "").trim();
  const questions = [...new Set(win.map((e) => clean(e.text)).filter((t) => t.includes("?") && t.length < 180))].slice(0, 5);
  const drivers = [...win]
    .sort((a, b) => b.text.length - a.text.length)
    .slice(0, 2)
    .map((e) => ({
      label: `“${clean(e.text).slice(0, 80)}${e.text.length > 80 ? "…" : ""}”`,
      direction: "positive" as const,
      detail: `${e.type} by ${e.fan} on ${e.platform} — ${isoDay(e.at!)}`,
    }));
  const voices = new Set(win.filter((e) => e.fan !== "unknown").map((e) => e.fan)).size;

  return {
    derived: true,
    meta: {
      trend,
      summary: `${win.length} community interactions from ${voices} distinct voices (${from} → ${to}). ${ratio === null ? "First window on record — momentum tracking starts here." : `Volume ${trend} at ${ratio.toFixed(2)}x the prior window.`} ${questions.length ? `${questions.length} question threads need answers — that's next week's content.` : ""}`.trim(),
      drivers,
      recurringQuestions: questions,
      recommendedActions: questions.length ? ["Answer the recurring questions in a dedicated post — they are this week's content fuel"] : ["Quote-reply your top champion's best take — make the leaderboard mean something"],
    },
  };
}

async function pullGuardrails(): Promise<string[]> {
  const g: string[] = ["Never auto-sends: all content awaits human approval (send_inbox_message excluded by design)"];
  const mem = arr((await safeCall("search_memories", { query: "content restrictions, off-limits topics, community preferences, agreed facts" }, null))?.memories ?? []);
  if (mem.length === 0) g.push("No stored content restrictions found");
  for (const m of mem.slice(0, 5)) g.push(`Respects memory: ${str(m?.text ?? m)}`);
  return g;
}

/* ---------- templated announcement (brand-voice aware, deterministic, no runtime LLM) ---------- */
function composeAnnouncement(p: Omit<Patch, "announcement">, voice: any, rewind: boolean): Patch["announcement"] {
  const emojiOn = voice?.creativity?.emojis !== false;
  const e = (s: string) => (emojiOn ? s : "");
  const champLine = p.champions.slice(0, 3).map((c) => c.name).filter(Boolean).join(", ");
  const buff = p.balance.buffs[0] ? `${p.balance.buffs[0].metric} ${p.balance.buffs[0].delta} · ${p.balance.buffs[0].note ?? p.balance.buffs[0].platform}`.trim() : null;
  const label = rewind ? `community rewind` : `week v${p.version}`;
  const firstLine = p.fanOfThePatch ? `🌟 Fan of the Patch: ${p.fanOfThePatch.name}` : null;
  const x = `${e("📋 ")}Patch Notes v${p.version} — ${label}\n\n${buff ? `📈 ${buff}\n` : ""}${p.meta.trend !== "unknown" ? `🧭 community meta: ${p.meta.trend}\n` : ""}${champLine ? `🏆 Rising champions: ${champLine}\n` : ""}${firstLine ? `${firstLine}\n` : ""}\nFull patch notes in replies 👇`.slice(0, 280);
  return {
    x,
    discordEmbed: {
      title: `${e("📋 ")}Patch Notes v${p.version}`,
      description: p.meta.summary.slice(0, 300),
      fields: [
        ...(buff ? [{ name: "📈 Buffs", value: buff.slice(0, 200) }] : []),
        ...(p.balance.nerfs[0] ? [{ name: "📉 Nerfs", value: `${p.balance.nerfs[0].metric} ${p.balance.nerfs[0].delta} ${p.balance.nerfs[0].platform}` }] : []),
        ...(champLine ? [{ name: "🏆 Rising Champions", value: champLine }] : []),
        ...(firstLine ? [{ name: "🌟 Fan of the Patch", value: p.fanOfThePatch!.name }] : []),
      ],
    },
  };
}

/* ---------- main ---------- */
export async function generatePatch(req: PatchRequest): Promise<Patch> {
  const maxChampions = req.maxChampions ?? 10;
  const stage = (s: string) => req.onStage?.(s);
  resetCallLog();

  stage("pulling full community activity (pagination)");
  const all = await fetchAllEvents(); await pace();
  stage(`rebuilt true timestamps for ${all.length} events — slicing window`);

  stage("reading account analytics + follower trends");
  const balance = await pullBalance(req.from, req.to, all); await pace();

  stage(`ranking fans ${req.from} → ${req.to}`);
  const champions = pullChampions(all, req.from, req.to, maxChampions);

  stage("building fan-of-the-patch story arc");
  const fanOfThePatch = pullFanArc(all, champions, req.from, req.to);

  stage("running sentiment skill (1 credit) — mining comments as backup");
  const { meta, derived } = await pullMeta(req.from, req.to, all); await pace();

  stage("checking community memories");
  const guardrails = await pullGuardrails(); await pace();

  stage("loading brand voice");
  const voice = await safeCall("get_brand_voice", {}, {});

  const rewind = new Date(req.to) < new Date(Date.now() - 2 * 864e5);
  if (derived) guardrails.push("Meta report derived from real community comments (sentiment skill unavailable/blocked — 0 extra credits burned)");
  if (all.some((e) => e.rebuilt)) guardrails.push("Timeline rebuilt from post IDs: FanBase backfill stamps events with ingestion time — we restore true dates");
  if (rewind) guardrails.push("Rewind patch: historical window reconstructed from backfilled activity");
  if (balance.dataSince && balance.buffs.length === 0 && balance.nerfs.length === 0)
    guardrails.push(`Follower snapshots began ${balance.dataSince} — KPI buffs/nerfs unlock once two snapshots exist`);

  stage("composing announcement drafts");

  const partial: Omit<Patch, "announcement"> = {
    version: req.version,
    window: { from: req.from, to: req.to },
    generatedAt: new Date().toISOString(),
    meta, balance, champions, fanOfThePatch, guardrails,
    stats: {
      fansRanked: champions.length,
      questionsSurfaced: meta.recurringQuestions.length,
      platformsCovered: new Set(all.filter((e) => inWindow(e.at, req.from, req.to)).map((e) => e.platform)).size,
    },
    provenance: getCallLog(),
  };
  return { ...partial, announcement: composeAnnouncement(partial, voice, rewind) };
}

/* ---------- the diff: our moat ---------- */
export function diffPatches(prev: Patch, curr: Patch): PatchDiff {
  const prevNames = new Set(prev.champions.map((c) => c.name));
  const currNames = new Set(curr.champions.map((c) => c.name));
  let biggestRiser: PatchDiff["biggestRiser"];
  for (const c of curr.champions) {
    const old = prev.champions.find((p) => p.name === c.name);
    if (old && old.rank - c.rank > (biggestRiser?.places ?? 0)) biggestRiser = { name: c.name, places: old.rank - c.rank };
  }
  const key = (b: { metric: string; platform: string }) => `${b.metric}:${b.platform}`;
  const prevNerfs = new Set(prev.balance.nerfs.map(key));
  return {
    from: prev.version, to: curr.version,
    newChampions: curr.champions.filter((c) => !prevNames.has(c.name)).map((c) => c.name),
    fallenChampions: prev.champions.filter((c) => !currNames.has(c.name)).map((c) => c.name),
    biggestRiser,
    metaShift: prev.meta.trend !== curr.meta.trend ? `${prev.meta.trend} → ${curr.meta.trend}` : undefined,
    buffsResolved: curr.balance.buffs.map(key).filter((k) => prevNerfs.has(k)),
    newNerfs: curr.balance.nerfs.map(key).filter((k) => !prevNerfs.has(k)),
  };
}
