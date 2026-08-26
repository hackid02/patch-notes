# Fixtures — the dev loop that saves our credits

The FanBase MCP charges **org credits** for skills/media/posting and rate-limits reads
(~20 calls/min). So we develop against replays, not the live API.

## How it works

| `FIXTURE_MODE` | Behavior |
|---|---|
| `record` | Calls the live MCP, saves every response here (`<tool>__<argHash>.json`) |
| `replay` | Never touches the network — replays saved files. UI dev happens here |
| unset | Live calls only (validation runs, final demo) |

## Rules
1. Record ONCE per scenario (fresh window, rewind window). Commit the fixtures.
2. Do all UI/render work in `replay` mode.
3. Go live only for: pipeline validation, credits sanity, and the recorded demo.
4. `tools-list.json` is committed and is the tool-surface source of truth.
5. **NEVER commit `.fanbase-tokens.json`** — it's a bearer credential.

## The sample patch
`sample-patch.json` is hand-written, plausible demo data — it lets the Patch Notes page
(and the diff view) be designed end-to-end before the live pipeline is proven, and doubles
as the honest fallback if a live account turns out too quiet for the video.
