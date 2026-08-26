import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { isConnected } from "./auth";

/**
 * Session gate for mutating/credit-spending endpoints (announce, patch generation).
 * Requires: server-side tokens present + the owner's fb_connected cookie +
 * same-origin request (Origin header must contain our host when present).
 * Not a multi-user auth system — enough to stop drive-by vandalism on the demo URL.
 */
export async function requireOwner(): Promise<NextResponse | null> {
  const jar = await cookies();
  if (!isConnected() || !jar.get("fb_connected")) {
    return NextResponse.json({ error: "owner session required — connect FanBase first" }, { status: 401 });
  }
  const h = await headers();
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (origin && host && !origin.includes(host)) {
    return NextResponse.json({ error: "cross-origin blocked" }, { status: 403 });
  }
  return null;
}

/** In-flight generation lock — one pipeline run per window, globally. */
const inFlight = new Set<string>();
export function acquireGenLock(key: string): boolean {
  if (inFlight.has(key)) return false;
  inFlight.add(key);
  return true;
}
export function releaseGenLock(key: string) { inFlight.delete(key); }
