import { NextRequest, NextResponse } from "next/server";
import { BASE, RESOURCE, SCOPES, ensureClient, pkce, requestOrigin } from "@/lib/auth";

/** GET /api/auth/login — kick off the OAuth dance (DCR + PKCE, then to FanBase consent). */
export async function GET(req: NextRequest) {
  try {
    const origin = requestOrigin(req);
    const clientId = await ensureClient(origin);
    const { verifier, challenge, state } = pkce();

    const url = new URL(`${BASE}/authorize`);
    url.search = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: `${origin}/api/auth/callback`,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: SCOPES,
      resource: RESOURCE, // RFC 8707 — mandatory, exact
      state,
    }).toString();

    const res = NextResponse.redirect(url);
    res.cookies.set("fb_oauth", JSON.stringify({ verifier, state, clientId, origin }), {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 600,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "login failed" }, { status: 500 });
  }
}
