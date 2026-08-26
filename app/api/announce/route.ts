import { NextResponse } from "next/server";
import { loadPatch } from "@/lib/store";
import { callTool, unwrap } from "@/lib/mcp";
import { isConnected, requestOrigin } from "@/lib/auth";
import { requireOwner } from "@/lib/guard";

/**
 * POST /api/announce { version, target: "x" | "discord", mode?: "schedule" | "post_now" }
 * Ships the patch's announcement draft via post_content. Owner-gated; requires posting consent + credits.
 * post_content schema (verified via tools/list, Aug 26):
 *   discord-bot → { platform:"discord-bot", channel(name|id), title, message, poll?, imageUrls?, scheduledAt? }
 */
export async function POST(req: Request) {
  const denied = await requireOwner();
  if (denied) return denied;
  if (!isConnected()) return NextResponse.json({ error: "FanBase not connected" }, { status: 401 });
  try {
    const { version, target, mode = "schedule" } = await req.json();
    const patch = loadPatch(String(version ?? ""));
    if (!patch) return NextResponse.json({ error: "patch not found" }, { status: 404 });
    if (!patch.announcement) return NextResponse.json({ error: "patch has no announcement draft" }, { status: 400 });

    const scheduledAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    if (target === "x") {
      if (!patch.announcement.x) return NextResponse.json({ error: "no X draft" }, { status: 400 });
      // twitter variant (verified): { platform:"twitter", message, imageUrls?, scheduledAt?, poll?{options≤4×25c} }
      try {
        const r: any = await callTool("post_content", {
          posts: [{
            platform: "twitter",
            message: patch.announcement.x,
            ...(mode === "schedule" ? { scheduledAt } : {}),
          }],
        });
        return NextResponse.json({ ok: true, target, mode });
      } catch (e: any) {
        return NextResponse.json({ error: `X post failed — ${e?.message ?? String(e)}` }, { status: 502 });
      }
    }

    if (target === "discord") {
      const listed: any = unwrap(await callTool("list_discord_channels", {}));
      const list: any[] = Array.isArray(listed?.channels) ? listed.channels : [];
      const chan = list.find((c) => String(c?.name ?? "").includes("announcement")) ?? list[0];
      if (!chan) return NextResponse.json({ error: "no Discord channels available" }, { status: 400 });

      const eb = patch.announcement.discordEmbed;
      const origin = requestOrigin(req);
      const patchUrl = `${origin}/patch/${String(patch.version).replace(".", "_")}`;
      const message = [
        eb?.description ?? "",
        ...(eb?.fields ?? []).map((f: any) => `**${f.name}** — ${f.value}`),
        ``,
        `📄 Full notes: ${patchUrl}`,
      ].join("\n").slice(0, 1900);

      const base = {
        platform: "discord-bot",
        channel: String(chan.name ?? chan.id),
        title: eb?.title ?? `Patch Notes v${patch.version}`,
        message,
        ...(mode !== "schedule" ? {} : { scheduledAt }),
      };
      const withPoll = {
        ...base,
        poll: {
          question: `Did Patch Notes v${patch.version} get the week right?`,
          options: ["🎯 Nailed it", "😐 Half right", "💀 Way off"],
          durationHours: 24,
          allowMultiselect: false,
        },
      };
      let lastErr = "";
      for (const post of [withPoll, base]) {
        try {
          const r: any = await callTool("post_content", { posts: [post] });
          return NextResponse.json({ ok: true, target, channel: chan?.name, url: patchUrl, poll: post === withPoll });
        } catch (e: any) { lastErr = e?.message ?? String(e); }
      }
      return NextResponse.json({ error: `Discord post failed — ${lastErr}` }, { status: 502 });
    }

    return NextResponse.json({ error: "target must be x or discord" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "announce failed" }, { status: 500 });
  }
}
