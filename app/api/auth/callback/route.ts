import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { exchange, saveTokens, saveSession } from "@/lib/auth";
import { sessionSetCookies } from "@/lib/session";

/** GET /api/auth/callback — FanBase sends the user back here with the auth code. */
export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const fail = (why: string) => NextResponse.redirect(`${u.origin}/?auth_error=${encodeURIComponent(why)}`);

  const error = u.searchParams.get("error");
  if (error) return fail(`FanBase said: ${error}`);

  let jar: any = {};
  try { jar = JSON.parse(req.cookies.get("fb_oauth")?.value ?? "{}"); } catch {}
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");

  if (!code || !jar.verifier || !jar.clientId || !jar.origin) return fail("missing auth session — start again from Connect");
  if (state !== jar.state) return fail("state mismatch — start again from Connect");

  let tokens: Record<string, unknown>;
  try {
    tokens = await exchange(code, jar.clientId, jar.verifier, `${jar.origin}/api/auth/callback`);
  } catch (e: any) {
    return fail(e?.message ?? "token exchange failed");
  }

  const res = NextResponse.redirect(`${jar.origin}/?connected=1`);
  res.cookies.delete("fb_oauth");

  // Web session (any visitor's org): tokens encrypted into THEIR cookies — nothing stored server-side
  const rec = {
    client_id: jar.clientId,
    access_token: String(tokens.access_token ?? ""),
    refresh_token: String(tokens.refresh_token ?? ""),
    expires_in: typeof tokens.expires_in === "number" ? tokens.expires_in : undefined,
    saved_at: new Date().toISOString(),
  };
  for (const c of sessionSetCookies(rec)) res.headers.append("Set-Cookie", c);

  // Local dev convenience: also mint the owner file session so scripts + probes keep working
  if (process.env.VERCEL !== "1") {
    try {
      saveTokens({ client_id: jar.clientId, ...tokens });
      const sessionToken = crypto.randomBytes(32).toString("hex");
      saveSession(sessionToken);
      res.cookies.set("fb_connected", sessionToken, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    } catch { /* read-only fs — cookies alone are enough */ }
  }
  return res;
}
