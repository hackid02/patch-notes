/**
 * The Patch — the core artifact. Everything renders from this JSON.
 * A patch = one window of community history, processed. Diff = two patches compared.
 */

export interface Patch {
  version: string;               // "1.0", "1.1" — assigned by us, per org
  window: { from: string; to: string }; // ISO dates — REWIND MODE: any historical window
  generatedAt: string;

  /** The meta report — from trigger_skill: sentiment-cross-platform */
  meta: {
    trend: "rising" | "stable" | "cooling" | "volatile" | "unknown";
    summary: string;             // 2-3 sentences, judge-legible
    drivers: { label: string; direction: "positive" | "negative"; detail: string }[];
    recurringQuestions: string[];      // what fans keep asking → content fuel
    recommendedActions: string[];      // from the sentiment skill
  };

  /** Buffs & nerfs — KPI movers over the window (get_account_analytics + get_analytics_trend) */
  balance: {
    buffs: { metric: string; platform: string; delta: string; note?: string }[];   // "followers +4.2% on X"
    nerfs: { metric: string; platform: string; delta: string; note?: string }[];
    dataSince?: string;          // firstSnapshotAt — honesty about trend coverage
  };

  /** Rising Champions — activity_summary groupBy:fan over the window */
  champions: {
    rank: number;
    name: string;                // handle/display
    clusterId: string;
    platforms: string[];
    tier?: string;               // from lookup_socials / crm enrichment
    score: number;               // window activity points
    momentum?: number;           // vs previous patch (this is what "rising" means)
  }[];

  /** Fan of the Patch — get_fan_activity narrative arc for the #1 story */
  fanOfThePatch?: {
    name: string;
    clusterId: string;
    arc: { when: string; event: string }[];  // "Aug 3 — first comment" → "Aug 19 — top 10"
    why: string;                 // 1-2 sentence writeup, brand voice
  };

  /** Treasury (stretch) — lapsed buyers when Shopify connected */
  treasury?: { lapsedBuyers: number; note: string };

  /** Guardrails applied — search_memories: restrictions honored, topics avoided */
  guardrails: string[];

  /** Big-number stats for the masthead cards */
  stats?: {
    fansRanked?: number;
    questionsSurfaced?: number;
    platformsCovered?: number;
  };

  /** MCP receipt — the real tools that built this patch, in call order */
  provenance?: string[];

  /** The drafted announcement copy (brand voice), awaiting human approval */
  announcement: {
    x?: string;
    discordEmbed?: { title: string; description: string; fields?: { name: string; value: string }[] };
    instagramCaption?: string;
  };
}

/** Diff between two patches — the compounding moat. */
export interface PatchDiff {
  from: string; to: string;      // versions
  newChampions: string[];        // entered leaderboard
  fallenChampions: string[];     // dropped off
  biggestRiser?: { name: string; places: number };
  metaShift?: string;            // trendA → trendB
  buffsResolved: string[];       // nerfs that got buffed
  newNerfs: string[];
}
