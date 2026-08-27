import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { cookies, headers } from "next/headers";
import { isConnected, hasOwnerSession, TOKEN_FILE } from "./auth";
import { sessionFromCookies, type SessionCtx } from "./session";

/**
 * Session gate for mutating/credit-spending endpoints (announce, patch generation).
 * Identity, in priority order:
 *   1. Encrypted cookie session (web flow — any FanBase org, guest or owner)
 *   2. Legacy owner session (local dev): server token file + owner cookie (timing-safe)
 * CSRF: POSTs require Origin host === our host. GET (SSE) relies on SameSite=Lax
 * cookies — browsers don't attach them cross-site.
 * Credits: whatever the caller does spends THEIR org's credits — consented during OAuth.
 */
export async function requireSession(method: string): Promise<{ ctx: SessionCtx } | NextResponse> {
  const jar = await cookies();
  const get = (n: string) => jar.get(n)?.value;

  const web = sessionFromCookies(get);
  let ctx: SessionCtx | null = web;
  if (!ctx && isConnected() && hasOwnerSession(get("fb_connected"))) {
    try {
      ctx = { rec: JSON.parse(readFileSync(TOKEN_FILE, "utf8")), dirty: false, isOwner: true };
    } catch { /* unreadable file → fall through to 401 */ }
  }
  if (!ctx) {
    return NextResponse.json({ error: "session required — connect FanBase first" }, { status: 401 });
  }

  if (method !== "GET") {
    const h = await headers();
    const origin = h.get("origin");
    const host = h.get("host")?.split(",")[0].trim();
    let originHost = "";
    try { originHost = new URL(origin ?? "").host; } catch { /* malformed */ }
    if (!originHost || !host || originHost !== host) {
      return NextResponse.json({ error: "cross-origin blocked" }, { status: 403 });
    }
  }
  return { ctx };
}

/** In-flight generation lock — one pipeline run at a time, globally (version numbers are shared).
 *  Guests queue behind each other too; the pipeline is credit-adjacent, not free. */
const inFlight = new Set<string>();
export function acquireGenLock(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}
export function releaseGenLock(key: string) { inFlight.delete(key); }
