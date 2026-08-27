/**
 * FanBase MCP client — streamable HTTP (stateless), OAuth bearer, fixture record/replay.
 *
 * Fixture dev loop:
 *   FIXTURE_MODE=record  -> calls live, saves each response to /fixtures
 *   FIXTURE_MODE=replay  -> never touches network, replays saved responses (UI dev)
 *   (unset)              -> live calls only
 */
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import path from "path";
import type { SessionCtx } from "./session";

const MCP_URL = process.env.FANBASE_MCP_URL ?? "https://api.copilot.fanbase.gg/mcp";
const FIXTURE_DIR = path.join(process.cwd(), "fixtures");
const MODE = process.env.FIXTURE_MODE as "record" | "replay" | undefined;
const TOKEN_FILE = path.join(process.cwd(), ".fanbase-tokens.json");

let rpcId = 0;

/** Real FanBase responses: payload in structuredContent OR content[0].text (JSON string). */
export const unwrap = (r: any): any => {
  if (r && typeof r === "object" && r.structuredContent && typeof r.structuredContent === "object") return r.structuredContent;
  const c = r?.content;
  if (Array.isArray(c) && c[0]?.type === "text") {
    try { return JSON.parse(c[0].text); } catch { return c[0].text; }
  }
  return r;
};

/* provenance: every patch carries a receipt of the real MCP tools that built it (judge candy) */
let callLog: string[] = [];
export function resetCallLog() { callLog = []; }
export function getCallLog() { return [...callLog]; }

export class McpError extends Error {
  constructor(public code: string, message: string, public status?: number) {
    super(message);
  }
}

function fixturePath(tool: string, args: unknown) {
  const hash = createHash("sha1").update(JSON.stringify(args ?? {})).digest("hex").slice(0, 8);
  return path.join(FIXTURE_DIR, `${tool}__${hash}.json`);
}

/** Reads the freshest access token, refreshing via the rotation-safe store if expired.
 *  Single-flight: concurrent refreshes share one promise — double-submitting a rotated
 *  refresh token is treated as theft by FanBase and revokes the whole token family. */
let refreshing: Promise<string> | null = null;

async function doRefresh(t: any): Promise<any> {
  const res = await fetch("https://api.copilot.fanbase.gg/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: t.client_id,
      refresh_token: t.refresh_token,
      resource: "https://api.copilot.fanbase.gg/mcp",
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new McpError("refresh_failed", JSON.stringify(json), res.status);
  // ROTATION: the newest refresh token replaces the old one (reuse = family revocation)
  return { ...t, ...json, refresh_token: json.refresh_token ?? t.refresh_token, saved_at: new Date().toISOString() };
}

const tokenFresh = (t: { saved_at: string; expires_in?: number }) => {
  // trust the server-issued expires_in (10-min safety margin, 60s floor)
  const ttlMs = Math.max(60_000, Number(t.expires_in ?? 3600) * 1000);
  return Date.now() - new Date(t.saved_at).getTime() < ttlMs - 600_000;
};

async function accessToken(ctx?: SessionCtx, force = false): Promise<string> {
  // per-request session (multi-user web flow — cookies) takes priority
  if (ctx) {
    if (!force && tokenFresh(ctx.rec)) return ctx.rec.access_token;
    const next = await doRefresh(ctx.rec);
    ctx.rec = next;      // persist happens at response time via persistSessionIfDirty
    ctx.dirty = true;
    return next.access_token;
  }
  // owner file mode (local dev / scripts)
  if (!existsSync(TOKEN_FILE))
    throw new McpError("no_tokens", "Run `node scripts/oauth-handshake.mjs` first.");
  const t = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  if (!force && tokenFresh(t)) return t.access_token;

  refreshing ??= doRefresh(t).then((next) => {
    const tmp = `${TOKEN_FILE}.tmp`;
    writeFileSync(tmp, JSON.stringify(next, null, 2));
    renameSync(tmp, TOKEN_FILE);
    return next.access_token as string;
  }).finally(() => { refreshing = null; });
  return refreshing;
}

/** Call BEFORE doing pipeline work: refreshes an expiring session up-front so the
 *  fresh tokens are set on THIS response's cookies (streams can't set cookies mid-flight). */
export async function ensureFreshSession(ctx: SessionCtx): Promise<void> {
  if (!tokenFresh(ctx.rec)) await accessToken(ctx, true);
}

/** Call one MCP tool. Back off politely on 429 (per-user ~20 calls/min budget).
 *  ctx = the calling user's session (multi-user web); omitted = owner file mode (local dev). */
export async function callTool<T = unknown>(
  tool: string,
  args: Record<string, unknown> = {},
  attempt = 0,
  ctx?: SessionCtx
): Promise<T> {
  const fp = fixturePath(tool, args);

  if (MODE === "replay") {
    if (!existsSync(fp)) throw new McpError("no_fixture", `Missing fixture: ${path.basename(fp)}`);
    return JSON.parse(readFileSync(fp, "utf8")) as T;
  }

  const t0 = Date.now();
  const res = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${await accessToken(ctx)}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name: tool, arguments: args } }),
  });

  const ms = () => Date.now() - t0;
  if (res.status === 429 && attempt < 4) {
    callLog.push(`${tool} · 429 backoff`);
    await new Promise((r) => setTimeout(r, 2 ** attempt * 3000));
    return callTool(tool, args, attempt + 1);
  }
  if (res.status === 401) {
    callLog.push(`${tool} · ${ms()}ms ✗ 401`);
    // clock said fresh but server rejected — force ONE rotation-aware refresh and retry once
    if (attempt === 0) {
      try { await accessToken(ctx, true); return callTool(tool, args, 1, ctx); } catch { /* fall through */ }
      throw new McpError("unauthorized", "Token rejected after refresh — reconnect FanBase (consent revoked?)", 401);
    }
    throw new McpError("unauthorized", "Reconnect FanBase (consent revoked?)", 401);
  }
  if (!res.ok) { callLog.push(`${tool} · ${ms()}ms ✗ ${res.status}`); throw new McpError("http_error", `${tool} -> ${res.status}`, res.status); }

  const raw = await res.text();
  const payload = raw.includes("data:")
    ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
    : raw;
  const json = JSON.parse(payload);
  if (json.error) { callLog.push(`${tool} · ${ms()}ms ✗ rpc`); throw new McpError("rpc_error", JSON.stringify(json.error)); }

  const result = json.result as T;
  // FanBase returns tool-level failures as HTTP 200 + result.isError:true (e.g. schema rejection).
  // Surface them as errors so callers can distinguish schema-rejected from delivered-but-flaky.
  if ((result as any)?.isError) {
    callLog.push(`${tool} · ${ms()}ms ✗ tool`);
    const txt = (result as any)?.content?.[0]?.text;
    throw new McpError("tool_error", typeof txt === "string" ? txt : `${tool} rejected`);
  }
  callLog.push(`${tool} · ${ms()}ms ✓`);
  if (MODE === "record") {
    mkdirSync(FIXTURE_DIR, { recursive: true });
    writeFileSync(fp, JSON.stringify(result, null, 2));
  }
  return result;
}

/** Start-then-poll helper: trigger_* / generate_* return a job ref; poll the matching check_* tool. */
export async function pollJob<T = unknown>(
  checkTool: string,
  jobArgs: Record<string, unknown>,
  { timeoutMs = 120_000, intervalMs = 4_000 } = {},
  ctx?: SessionCtx
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const r = unwrap(await callTool(checkTool, jobArgs, 0, ctx)) as { status?: string; state?: string; analysis?: unknown; result?: unknown };
    if (r?.status === "completed" || r?.status === "failed" || r?.state === "completed") return r as T;
    if (r?.analysis || r?.result) return r as T; // payload present without explicit status
    if (Date.now() > deadline) throw new McpError("poll_timeout", `${checkTool} timed out`);
    await new Promise((res) => setTimeout(res, intervalMs));
  }
}
