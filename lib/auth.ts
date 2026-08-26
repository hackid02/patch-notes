/**
 * OAuth 2.1 server side (fanbase-app-builder spec):
 * DCR (public client) + PKCE S256 + mandatory resource indicator + refresh rotation.
 * Tokens live server-side only. Single-tenant for the demo; swap TOKEN_PATH for KV in prod.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import crypto from "crypto";

export const BASE = "https://api.copilot.fanbase.gg";
export const RESOURCE = `${BASE}/mcp`;
export const SCOPES = "mcp:tools";

const DATA_DIR = path.join(process.cwd(), "data");
const CLIENT_FILE = path.join(DATA_DIR, "fanbase-client.json");
export const TOKEN_FILE = path.join(process.cwd(), ".fanbase-tokens.json");

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/**
 * The request's true public origin. Dev servers bound to 0.0.0.0 rewrite req.url's host,
 * so derive from Host / x-forwarded-* (what reverse proxies actually send) instead.
 * Proto: trust x-forwarded-proto; else http for loopback, https for any public host.
 */
export function requestOrigin(req: { headers: Headers; url: string }): string {
  const rawHost = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? new URL(req.url).host).split(",")[0].trim();
  const isLoop = /^(0\.0\.0\.0|localhost|127\.0\.0\.1|\[?::1\]?)(:|$)/.test(rawHost);
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0].trim() ?? (isLoop ? "http" : "https");
  const host = isLoop ? `localhost:${rawHost.split(":").pop() ?? "3000"}` : rawHost;
  return `${proto}://${host}`;
}

export function pkce() {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge, state: b64url(crypto.randomBytes(16)) };
}

/** POST with retry — FanBase's /register 5xx-flakes under bursts. */
async function postWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let last: Response | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      if (res.status < 500) return res;
      last = res;
    } catch (e) {
      if (i === attempts - 1) throw e;
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, (i + 1) * 1500));
  }
  return last!;
}

/** Register (or reuse) a dynamic client per deployment origin (RFC 7591). Cached on disk. */
export async function ensureClient(origin: string): Promise<string> {
  let cache: { byOrigin?: Record<string, string> } = {};
  if (existsSync(CLIENT_FILE)) {
    try { cache = JSON.parse(readFileSync(CLIENT_FILE, "utf8")); } catch {}
  }
  if (cache.byOrigin?.[origin]) return cache.byOrigin[origin];

  const res = await postWithRetry(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Patch Notes (community patch engine)",
      redirect_uris: [`${origin}/api/auth/callback`],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SCOPES,
    }),
  });
  const json = await res.json();
  if (!res.ok || !json.client_id) throw new Error(`client registration failed: ${res.status} ${JSON.stringify(json)}`);
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CLIENT_FILE, JSON.stringify({ byOrigin: { ...cache.byOrigin, [origin]: json.client_id } }, null, 2));
  return json.client_id;
}

export async function exchange(code: string, clientId: string, verifier: string, redirectUri: string) {
  const res = await postWithRetry(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: RESOURCE,
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${JSON.stringify(json)}`);
  return json;
}

export function saveTokens(t: Record<string, unknown>) {
  writeFileSync(TOKEN_FILE, JSON.stringify({ ...t, saved_at: new Date().toISOString() }, null, 2));
}

export function isConnected() {
  return existsSync(TOKEN_FILE);
}
