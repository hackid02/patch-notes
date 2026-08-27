# 📋 Patch Notes — your community is a live-service game. Ship its patch notes.

A one-click engine that turns real [FanBase MCP](https://api.copilot.fanbase.gg/mcp) data into a
**shareable weekly release** for any creator community:

- 🧭 **Meta Report** — sentiment + recurring fan questions, mined from real comments (paid sentiment skill when available, comment-mining fallback that costs 0 credits)
- ⚖️ **Buffs & Nerfs** — follower trends via `get_analytics_trend` + activity-volume deltas
- 🏆 **Rising Champions** — the community's real people, ranked from live activity
- 🌟 **Fan of the Patch** — the #1 contributor's story arc, quoted in their own words
- Δ **Patch Diffs** — every patch diffs against the previous one; the series compounds
- 📮 **Announcement drafts** — brand-voice X post + Discord embed, **human-gated** (arm-to-confirm), then shipped via `post_content` with a native Discord poll
- 🧾 **MCP Receipt** — every patch carries the timed list of real tool calls that built it

Built for the **XBorg FanBase MCP Builder Competition** (Aug 2026).

## Why it's not another inbox copilot

Every competition entry drafts for the creator. This one **publishes to the community**:
fan-facing artifacts, a versioned series, and a diff as the compounding moat.
`send_inbox_message` is structurally excluded — nothing auto-sends, ever.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4 · zero backend beyond JSON files.
OAuth 2.1 (PKCE + DCR + refresh rotation, single-flight) against FanBase's MCP streamable-HTTP endpoint.

## Run locally (no credentials needed for the visual tour)

```bash
npm install
npm run dev
# http://localhost:3000 → landing + /patch/1_0 sample artifact
```

Generation + announce need a FanBase OAuth handshake (`scripts/oauth-handshake.mjs`) and owner token file —
not included in this repo for obvious reasons. See `fixtures/tools-reference.md` for the verified MCP surface.

## Hard-won MCP truths (all verified live, Aug 2026)

- `query_activity` / `activity_summary` **ignore window params on backfilled data**; backfilled events are
  stamped with ingestion time → we rebuild true timestamps by decoding snowflake IDs (X/Discord) client-side.
- `connectionId` lives in `get_account_analytics({}).accounts`, NOT `list_platform_connections`.
- Analytics snapshots start at connection day (no backfill) — buffs/nerfs fall back to activity deltas honestly.
- Tool payloads arrive in `content[0].text` (JSON string) and sometimes `structuredContent` — `lib/mcp.ts#unwrap`.
- `post_content` (discord-bot) schema: `{ channel (name|id), title, message, poll?, imageUrls?, scheduledAt? }`.
- Rate limit ≈ 20 calls/min/user → the pipeline paces calls and the skill poller budgets for it.

## Repo map

```
lib/pipeline.ts   the patch engine (windows → Patch JSON) + diffPatches
lib/mcp.ts        MCP client: unwrap, 429 backoff, single-flight refresh, provenance callLog
lib/auth.ts       OAuth 2.1 server flow (DCR per-origin cache, origin derivation for proxies)
lib/store.ts      patch persistence (real series separate from sample fixtures)
app/patch/[version]  the artifact page (+ auto-diff banner vs previous patch)
app/api/patch*    generation (POST + SSE stream of stages)
app/api/announce  human-approved publish via post_content (Discord embed + poll, X schedule)
components/HallOfFame.tsx  the series strip — the compounding moat, visible
```

`send_inbox_message` is deliberately absent from every code path: all content awaits human approval.

## Multi-user connect (the "try it with YOUR FanBase" path)

The public deployment accepts any creator's own FanBase org — statelessly:

- **OAuth 2.1 + PKCE + DCR** per the fanbase-app-builder spec; the public origin's client is pinned via `FANBASE_CLIENT_ID`
- **Zero server-side credential storage.** Tokens are AES-256-GCM encrypted into the visitor's own HttpOnly/Secure/SameSite=Lax cookies (`lib/session.ts`); refresh rotation re-encrypts onto the response
- **Credit isolation by design.** A guest's Generate/Post spends *their* org's credits (consented at OAuth) — the host's credits are unreachable from the public URL
- **Guests get live previews**, owners get archival + versioning + diffs. `NEXT_PUBLIC_DEMO_READONLY=1` is a one-env rollback to showcase-only mode

### Deploy your own

```
vercel deploy        # or any Next.js host
env: FANBASE_CLIENT_ID=<dcr for your origin>   SESSION_SECRET=<openssl rand -hex 32>
```

Self-hosted (owner mode): `node scripts/oauth-handshake.mjs` writes the local token file — no envs needed.

## Security

Went through an independent adversarial review before submission: **24 findings (4 P0), all 24 fixed** — full triage in [REVIEW-RESPONSE.md](./REVIEW-RESPONSE.md). Session gates are timing-safe, POSTs require exact Origin-host equality, patch versions are path-traversal-proof, and announce retries fire only on schema rejection (a flaky network can never double-post to your community).

