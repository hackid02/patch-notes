import { NextResponse } from "next/server";
import { loadPatch, isValidVersion } from "@/lib/store";
import { callTool, unwrap, McpError, ensureFreshSession } from "@/lib/mcp";
import { requestOrigin } from "@/lib/auth";
import { requireSession } from "@/lib/guard";
import { persistSessionIfDirty } from "@/lib/session";

/**
 * POST /api/announce — ship an announcement draft via post_content. Session-gated:
 * the post spends the CALLER's org credits (owner or guest — consented at OAuth).
 *
 * Body:
 *   owner (archived patch): { version, target, mode? }
 *   guest (live preview):   { draft: { announcement, versionLabel }, target, mode? }
 *
 * post_content schema (verified via tools/list, Aug 26):
 *   discord-bot → { platform:"discord-bot", channel(name|id), title, message, poll?, imageUrls?, scheduledAt? }
 *   twitter     → { platform:"twitter", message, imageUrls?, scheduledAt?, poll? }
 */
export async function POST(req: Request) {
  const gate = await requireSession("POST");
  if (gate instanceof NextResponse) return gate;
  const { ctx } = gate;

  const done = (status: number, body: Record<string, unknown>) =>
    persistSessionIfDirty(NextResponse.json(body, { status }), ctx) as NextResponse;

  try {
    const { version, target, mode = "schedule", draft } = await req.json();

    // resolve the announcement: guest-supplied draft, or the archived patch's own draft
    let announcement: any = null;
    let versionLabel = "preview";
    let patchUrl: string | null = null;

    if (draft?.announcement) {
      announcement = draft.announcement;
      versionLabel = typeof draft.versionLabel === "string" ? draft.versionLabel.slice(0, 12) : "preview";
    } else {
      if (!isValidVersion(version)) return done(400, { error: "version must look like 1.2" });
      const patch = loadPatch(version);
      if (!patch) return done(404, { error: "patch not found" });
      announcement = patch.announcement;
      versionLabel = patch.version;
      // links inside shipped posts point at the STABLE public origin, not a proxy/tunnel
      const origin = process.env.PUBLIC_BASE_URL?.replace(/\/+$/, "") ?? requestOrigin(req);
      patchUrl = `${origin}/patch/${String(patch.version).replace(".", "_")}`;
    }
    if (!announcement) return done(400, { error: "no announcement draft" });

    try { await ensureFreshSession(ctx); }
    catch { return done(401, { error: "FanBase session expired — hit Connect again" }); }

    const scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    if (target === "x") {
      const msg = typeof announcement.x === "string" ? announcement.x.slice(0, 4000) : null;
      if (!msg) return done(400, { error: "no X draft" });
      try {
        await callTool("post_content", {
          posts: [{ platform: "twitter", message: msg, ...(mode === "schedule" ? { scheduledAt } : {}) }],
        }, 0, ctx);
        return done(200, { ok: true, target, mode });
      } catch (e: any) {
        return done(502, { error: `X post failed — ${e?.message ?? String(e)}` });
      }
    }

    if (target === "discord") {
      const listed: any = unwrap(await callTool("list_discord_channels", {}, 0, ctx));
      const list: any[] = Array.isArray(listed?.channels) ? listed.channels : [];
      // never blind-fallback to list[0] — a miss must not land in a mod/staff channel
      const chan = list.find((c) => String(c?.name ?? "").includes("announcement"));
      if (!chan) return done(400, {
        error: `no announcements channel found — available: ${list.map((c) => c?.name ?? c?.id).filter(Boolean).join(", ") || "none"}`,
      });

      const eb = announcement.discordEmbed;
      const lines = [
        String(eb?.description ?? "").slice(0, 400),
        ...(Array.isArray(eb?.fields) ? eb.fields : []).map((f: any) => `**${String(f?.name ?? "").slice(0, 60)}** — ${String(f?.value ?? "").slice(0, 200)}`),
      ];
      if (patchUrl) lines.push("", `📄 Full notes: ${patchUrl}`);
      const message = lines.join("\n").slice(0, 1900);

      const base = {
        platform: "discord-bot",
        channel: String(chan.name ?? chan.id),
        title: String(eb?.title ?? `Patch Notes v${versionLabel}`).slice(0, 120),
        message,
        ...(mode !== "schedule" ? {} : { scheduledAt }),
      };
      const withPoll = {
        ...base,
        poll: {
          question: `Did Patch Notes v${versionLabel} get the week right?`,
          options: ["🎯 Nailed it", "😐 Half right", "💀 Way off"],
          durationHours: 24,
          allowMultiselect: false,
        },
      };
      let lastErr = "";
      for (const post of [withPoll, base]) {
        try {
          await callTool("post_content", { posts: [post] }, 0, ctx);
          return done(200, { ok: true, target, channel: chan?.name, url: patchUrl, poll: post === withPoll });
        } catch (e: any) {
          lastErr = e?.message ?? String(e);
          // Only retry the no-poll variant when FanBase REJECTED THE PAYLOAD SHAPE.
          // Network/5xx failures may still have queued the post — retrying those double-posts in public.
          const schemaRejected = e instanceof McpError && (e.status === 400 || e.code === "rpc_error" || e.code === "tool_error");
          if (!schemaRejected) throw e;
        }
      }
      return done(502, { error: `Discord post failed — ${lastErr}` });
    }

    return done(400, { error: "target must be x or discord" });
  } catch (e: any) {
    return done(500, { error: e?.message ?? "announce failed" });
  }
}
