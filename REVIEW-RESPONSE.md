# Patch Notes — Review Response & Triage

**Input:** "Adversarial Code Review" (4 × P0 · 11 × P1 · 9 × P2), reviewed against the exact files it cited.
**Method:** every finding independently re-verified against source before any change. Zero fabrications found — the reviewer's math checks (pagination filter bug, meta-ratio denominator, snowflake epoch) all reproduced on inspection.
**Result:** 24/24 findings addressed. Typecheck clean (`tsc --noEmit`), production build green (`next build`).

---

## P0 — all fixed

| # | Finding | Fix |
|---|---|---|
| 1 | `requireOwner` bypass (forgeable cookie · substring origin check · missing-Origin skip) | Callback now mints a 256-bit session token, mirrored server-side in `data/fb-session.json`; `hasOwnerSession()` compares with `crypto.timingSafeEqual`. Origin check is exact host equality (`new URL(origin).host !== host`); **missing Origin now rejects** on POST. |
| 2 | Announce fallback loop double-posts | Fallback from poll→no-poll now advances **only on a payload-shape rejection** (`McpError` with status 400 / `rpc_error` / `tool_error`). Network or 5xx failures propagate instead of retrying. Bonus fix that makes this sound: `callTool` now surfaces `result.isError` tool-level failures as thrown errors (FanBase returns them as HTTP 200). |
| 3 | Path traversal via `version` → arbitrary file write/read | `isValidVersion` (`/^\d+(\.\d+)?$/`) enforced in `savePatch`, `loadPatch`, `/api/patch`, `/api/patch/stream`, `/api/announce`. Invalid → 400/404/throw, never reaches `path.join`. |
| 4 | Fresh clone renders empty landing | (a) `data/patches/*.json` is now **committed** — the real generated v1.0/v1.1 series ships with the repo; (b) landing falls back to fixture versions `["1.0","1.1"]` when the archive is empty; (c) the "sample data" label now only appears when fixtures are actually in use (fixes P2-23 at the same time). |

## P1 — all fixed

| # | Finding | Fix |
|---|---|---|
| 5 | Token TTL hardcoded; 401 never refreshes | TTL from server-issued `expires_in` (10-min margin). A 401 on attempt 0 forces one rotation-aware refresh and retries once; only then throws "consent revoked?". |
| 6 | DCR poisoning via `X-Forwarded-Host` | `APP_ORIGIN` env short-circuits header derivation in prod; `x-forwarded-*` ignored unless `TRUST_PROXY=1`. Plain `Host` otherwise. |
| 7 | Pagination stops at first filtered event | Loop breaks on **raw** page length; filtered batch only appends. Silent data loss eliminated. |
| 8 | Meta ratio: mismatched denominators | Prior-window count now filtered by `&& e.text` to match the numerator. |
| 9 | Discord epoch via case-sensitive compare | `/discord/i.test(platform)` — covers `Discord`, `discord-bot`, etc. |
| 10 | Version allocated before generation, window-scoped lock | Lock is now global (`"generate"`); allocation filters `Number.isFinite`; `body.version` validated. |
| 11 | Missing patch fields crash pages | `loadPatch` merges defaults at the read boundary (`champions/guardrails/announcement/balance/meta/stats/provenance`). Champions block got a real empty state. |
| 12 | Credit spend behind browser-retried GET | Finished runs cached per window for 120s; an auto-retried GET replays the `{done}` frame and spends nothing. Global lock + improved 401-hint copy in the form. |
| 13 | No date validation | Both routes: `YYYY-MM-DD` shape, `from ≤ to`, span ≤ 90 days. |
| 14 | Non-atomic token write | tmp+`renameSync` in both the refresh path and `saveTokens`. |
| 15 | Blind Discord channel fallback (`?? list[0]`) | Removed. No match → 400 naming the available channels. |

## P2 — fixed in the same pass

- **16** First-window trend: `"unknown"`, not `"rising"` (the badge no longer claims momentum from one data point — applies to future patches).
- **17** Diffs & momentum match by `clusterId` with name fallback (display-name changes no longer split one fan into "fallen"+"new").
- **18** Fetch cap now disclosed: guardrail "Activity feed exceeded 500 events — numbers floor, not exact".
- **19** `LIVE_PACE_MS` comment corrected (≈40/min ceiling; polling dominates true rate).
- **20** X draft truncation is code-point safe (`Array.from` slice at 270) — no more split emoji, 280-margin respected.
- **21** `replace("_",".")` → `replaceAll`, plus route-level version-shape validation (`/patch/NaN` is dead).
- **22** Stream `cancel()` only releases the lock if the run never finished.
- **23** "sample data" label is now derived from the actual source (fixtures vs generated archive) — true in both directions.
- **24** Generated-at renders UTC with an explicit label (no silent server-timezone presentation).

## Deliberately unchanged

- **SSE over GET for generation.** The review's long-term suggestion (POST + job id) is right for production; for the demo surface the 120s window-cache + global lock removes the actual credit-spend hazard, and a full job-queue rewrite post-review risks regressions the deadline can't absorb. Noted as the next milestone.
- **Fixture replay mode.** Dev-only affordance; untouched by design.

## Verified by the reviewer, untouched

Prev-window math across month/year boundaries · divide-by-zero guards · `ThemeToggle` hydration pattern.
