import { NextRequest, NextResponse } from "next/server";
import { sessionClearCookies } from "@/lib/session";

/** GET /api/auth/logout — clear the encrypted session cookies (theirs only; owner files stay local). */
export async function GET(req: NextRequest) {
  const res = NextResponse.redirect(new URL("/", req.url));
  for (const c of sessionClearCookies()) res.headers.append("Set-Cookie", c);
  return res;
}
