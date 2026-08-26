#!/usr/bin/env node
/**
 * FanBase MCP — one-shot OAuth 2.1 handshake.
 * Spec: fanbase-app-builder skill (RFC 9728 / 7591 / 8707).
 *
 * What it does:
 *   1. Dynamic client registration (public client, no secret)   POST /register
 *   2. PKCE (S256) authorization flow with resource indicator   GET  /authorize
 *   3. Token exchange                                           POST /token
 *   4. Saves tokens to .fanbase-tokens.json  (NEVER commit this)
 *   5. Sanity-check: calls tools/list and prints the live tool names
 *
 * Usage:
 *   node scripts/oauth-handshake.mjs          -> full handshake (opens URL to sign in)
 *   node scripts/oauth-handshake.mjs refresh  -> rotate the refresh token
 *
 * You need: a FanBase account with at least one platform connected.
 */
import http from "node:http";
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const BASE = "https://api.copilot.fanbase.gg";
const RESOURCE = `${BASE}/mcp`; // RFC 8707 resource indicator — must be EXACTLY this
const REDIRECT_URI = "http://127.0.0.1:8787/callback";
const TOKEN_FILE = new URL("../.fanbase-tokens.json", import.meta.url).pathname;

const b64url = (buf) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const postForm = async (url, params) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
};

const saveTokens = (t) => {
  writeFileSync(TOKEN_FILE, JSON.stringify({ ...t, saved_at: new Date().toISOString() }, null, 2));
  console.log(`\n✅ Tokens saved to .fanbase-tokens.json (access ~1h, refresh ~30d, refresh rotates on every use)`);
};

async function refreshFlow() {
  const t = JSON.parse(readFileSync(TOKEN_FILE, "utf8"));
  const json = await postForm(`${BASE}/token`, {
    grant_type: "refresh_token",
    client_id: t.client_id,
    refresh_token: t.refresh_token,
    resource: RESOURCE,
  });
  // ROTATION: the old refresh token is now dead. Persist the new one immediately.
  saveTokens({ ...t, ...json, refresh_token: json.refresh_token ?? t.refresh_token });
}

async function handshake() {
  // 1. Dynamic client registration (RFC 7591)
  const reg = await fetch(`${BASE}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "PatchNotes (builder competition)",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "mcp:tools",
    }),
  });
  if (!reg.ok) throw new Error(`/register -> ${reg.status}: ${await reg.text()}`);
  const { client_id } = await reg.json();

  // 2. PKCE
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  const state = b64url(crypto.randomBytes(16));

  const url = new URL(`${BASE}/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT_URI,
    code_challenge: challenge,
    code_challenge_method: "S256",
    scope: "mcp:tools",
    resource: RESOURCE,
    state,
  });

  console.log("\n🔐 Open this URL in your browser and sign in to FanBase:\n");
  console.log(url.toString(), "\n");
  console.log("(pick your organization + grant posting consent when asked)");

  // 3. Catch the redirect
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, "http://127.0.0.1:8787");
      if (u.pathname !== "/callback") return;
      if (u.searchParams.get("state") !== state) {
        reject(new Error("state mismatch")); res.end("state mismatch"); server.close(); return;
      }
      const err = u.searchParams.get("error");
      if (err) { reject(new Error(`authorize error: ${err}`)); res.end("auth failed — you can close this tab"); server.close(); return; }
      res.end("✅ Authorized — you can close this tab and go back to the terminal.");
      server.close();
      resolve(u.searchParams.get("code"));
    });
    server.listen(8787, "127.0.0.1");
    setTimeout(() => { server.close(); reject(new Error("timed out waiting for redirect (5 min)")); }, 5 * 60 * 1000);
  });

  // 4. Exchange code (redeem promptly — codes are single-use and short-lived)
  const tokens = await postForm(`${BASE}/token`, {
    grant_type: "authorization_code",
    client_id,
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    resource: RESOURCE,
  });
  saveTokens({ client_id, ...tokens });

  // 5. Sanity check — talk to the MCP
  const mcp = await fetch(RESOURCE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${tokens.access_token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  const raw = await mcp.text();
  const data = raw.startsWith("event:") || raw.includes("data:")
    ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("")
    : raw;
  const parsed = JSON.parse(data);
  const tools = parsed.result?.tools ?? [];
  console.log(`\n🛠  Live tools on the server (${tools.length}):\n`);
  for (const t of tools) console.log(`  - ${t.name}`);
  writeFileSync(
    new URL("../fixtures/tools-list.json", import.meta.url).pathname,
    JSON.stringify(parsed.result, null, 2)
  );
  console.log("\n📦 Full tools/list saved to fixtures/tools-list.json — commit THIS one, it\'s our source of truth.");
}

const mode = process.argv[2];
if (mode === "refresh") refreshFlow().catch((e) => (console.error("❌", e.message), process.exit(1)));
else if (existsSync(TOKEN_FILE) && mode !== "reauth")
  console.log("Tokens already exist. Run with `refresh` to rotate, or `reauth` to start over.");
else handshake().catch((e) => (console.error("❌", e.message), process.exit(1)));
