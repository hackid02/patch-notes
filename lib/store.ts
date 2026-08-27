/**
 * Patch storage. MVP: flat JSON files in /data/patches (created on save).
 * Sample fixtures ship in /fixtures so the UI is demoable with zero credentials.
 *
 * Security: `version` reaches disk paths — it is validated at this boundary AND in every
 * API route that accepts it, so path traversal can't be reintroduced downstream.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import path from "path";
import type { Patch } from "./patch";

const DATA_DIR = path.join(process.cwd(), "data", "patches");
const FIXTURE_DIR = path.join(process.cwd(), "fixtures");

/** "1.0", "1.12" — digits with an optional single decimal segment. Nothing else ever hits disk. */
const VERSION_RE = /^\d+(\.\d+)?$/;
export const isValidVersion = (v: unknown): v is string => typeof v === "string" && VERSION_RE.test(v);

export function savePatch(p: Patch) {
  if (!isValidVersion(p?.version)) throw new Error(`invalid patch version: ${String(p?.version)}`);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, `v${p.version}.json`), JSON.stringify(p, null, 2));
}

/** Any archived JSON can be missing keys (schema drift) — default at the read boundary so
 *  one malformed patch can't take down a whole page. */
function withDefaults(p: any): Patch {
  return {
    stats: {}, provenance: [], champions: [], guardrails: [], announcement: {},
    ...p,
    balance: { buffs: [], nerfs: [], ...(p?.balance ?? {}) },
    meta: {
      trend: "unknown", summary: "", drivers: [],
      recurringQuestions: [], recommendedActions: [],
      ...(p?.meta ?? {}),
    },
  };
}

export function loadPatch(version: string): Patch | null {
  if (!isValidVersion(version)) return null;
  const live = path.join(DATA_DIR, `v${version}.json`);
  const sample = path.join(FIXTURE_DIR, `sample-patch-v${version.replace(".", "_")}.json`);
  for (const f of [live, sample]) {
    if (!existsSync(f)) continue;
    try { return withDefaults(JSON.parse(readFileSync(f, "utf8"))); } catch { return null; }
  }
  return null;
}

/** Real (generated) versions only — sample fixtures must NOT pollute the series, diffs, or numbering. */
export function listPatchVersions(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  const names: string[] = [];
  for (const f of readdirSync(DATA_DIR)) {
    const m = f.match(/^v(\d+(?:_\d+|\.\d+)*)\.json$/);
    if (m) names.push(m[1].replaceAll("_", "."));
  }
  return [...new Set(names)].filter(isValidVersion).sort((a, b) => parseFloat(a) - parseFloat(b));
}

/** The patch right before `version` in the archive (for auto-diff). */
export function previousVersion(version: string): string | null {
  const all = listPatchVersions();
  const i = all.indexOf(version);
  return i > 0 ? all[i - 1] : null;
}
