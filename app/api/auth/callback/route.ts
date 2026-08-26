import { NextRequest, NextResponse } from "next/server";
import { exchange, saveTokens } from "@/lib/auth";

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

  try {
    const tokens = await exchange(code, jar.clientId, jar.verifier, `${jar.origin}/api/auth/callback`);
    saveTokens({ client_id: jar.clientId, ...tokens });
  } catch (e: any) {
    return fail(e?.message ?? "token exchange failed");
  }

  const res = NextResponse.redirect(`${jar.origin}/?connected=1`);
  res.cookies.delete("fb_oauth");
  res.cookies.set("fb_connected", "1", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
