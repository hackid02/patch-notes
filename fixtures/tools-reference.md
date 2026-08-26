# Live tool signatures — confirmed via Claude on the production MCP (Aug 24)

## Analytics (CONFIRMED LIVE Aug 24)
- `get_account_analytics(platform?)`
- `get_analytics_trend(connectionId, metric, from?, to?)` — EXISTS. `connectionId` required
  (get it from `list_platform_connections`); metric ∈ followers | following | posts | views | likes | engagement.
  ⚠️ Snapshots only exist from connection day — no backfill.

## Understand / read
- `list_platform_connections(platforms?)`
- `get_account_analytics(platform?)`
- `activity_summary(after?, before?, groupBy?, type?, platform?, limit?)` — fan leaderboard = groupBy:"fan"
- `query_activity(after?, before?, type?, platform?, page?, limit?, sortDirection?)`
- `get_fan_activity(clusterId, after?, before?, type?, platform?, page?, limit?, sortDirection?)`
- `list_crm(search?, platforms?, minEngagement?, maxEngagement?, statKey?, minStat?, maxStat?, minPlatforms?, activeAfter?, activeBefore?, sortBy?, sortDirection?, page?, limit?)`
- `lookup_socials(apps, channel?, startDate?, endDate?, maxResults?, includeComments?, includeMentions?, maxCommentsPerPost?, topRepliesCount?)`

## Inbox (DMs — pipeline NEVER sends; read-only context only)
- `list_conversations(platform?, status?, search?, page?, limit?, sortDirection?)`
- `get_conversation(threadId, messageLimit?, page?)`
- `resync_conversation(threadId)`
- `send_inbox_message(threadId, text)` — INSTANT SEND, NO DRAFT. Off-limits in demo.

## Ground truth
- `get_brand_voice()`
- `update_brand_voice(identity?, guidelines?, creativity?)`
- `generate_brand_voice(instructions?)` + `check_brand_voice_generation(executionId)` — draft only
- `search_memories(query?, keywords?)`
- `search_documents(queries[])` — NO_ANSWER = don't guess

## Create (drafts only, never auto-publish)
- `trigger_skill(skill, instructions?)` + `check_skill_generation(executionId)`
  - post-creator-{x,instagram,discord,discord-post,tiktok,youtube}
  - poll-creator-{x,discord} · trivia-creator-discord
  - sentiment-{x,instagram,discord,cross-platform} ← our meta report
- `generate_reply_recommendations(platform, instructions?)` + `check_reply_generation(executionId)`
- `create_media_upload_url(filename, contentType)` → publicUrl

## Review & ship
- `list_recommendations(status?, types?, startDate?, endDate?, page?, limit?, sortDirection?)`
- `update_recommendation(recommendationId, action, data?, startDate?)`
- `list_discord_channels()`
- `post_content(posts[])` — one post object per platform; images/polls/scheduling; REAL publish

## Runtime facts
- Rate limit ~20 tool calls/min per user → pipeline paces calls (~3s apart live)
- Skills/media/posting consume org credits; reads free; a patch ≈ 16–18 calls + 1 skill credit
- Analytics trends: no backfill before firstSnapshotAt; null = not collected (NOT a decline)
