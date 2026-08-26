/**
 * Patch storage. MVP: flat JSON files in /data/patches (created on save).
 * Sample fixtures ship in /fixtures so the UI is demoable with zero credentials.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "fs";
import path from "path";
import type { Patch } from "./patch";

const DATA_DIR = path.join(process.cwd(), "data", "patches");
const FIXTURE_DIR = path.join(process.cwd(), "fixtures");

export function savePatch(p: Patch) {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(path.join(DATA_DIR, `v${p.version}.json`), JSON.stringify(p, null, 2));
}

export function loadPatch(version: string): Patch | null {
  const live = path.join(DATA_DIR, `v${version}.json`);
  const sample = path.join(FIXTURE_DIR, `sample-patch-v${version.replace(".", "_")}.json`);
  for (const f of [live, sample]) {
    if (existsSync(f)) return JSON.parse(readFileSync(f, "utf8"));
  }
  return null;
}

/** Real (generated) versions only — sample fixtures must NOT pollute the series, diffs, or numbering. */
export function listPatchVersions(): string[] {
  if (!existsSync(DATA_DIR)) return [];
  const names: string[] = [];
  for (const f of readdirSync(DATA_DIR)) {
    const m = f.match(/^v(\d+(?:_\d+|\.\d+)*)\.json$/);
    if (m) names.push(m[1].replace("_", "."));
  }
  return [...new Set(names)].sort((a, b) => parseFloat(a) - parseFloat(b));
}

/** The patch right before `version` in the archive (for auto-diff). */
export function previousVersion(version: string): string | null {
  const all = listPatchVersions();
  const i = all.indexOf(version);
  return i > 0 ? all[i - 1] : null;
}
