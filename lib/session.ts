/**
 * Stateless multi-user sessions: FanBase tokens encrypted into the visitor's own cookies.
 * No database — AES-256-GCM with a server-only secret. Cookie chunks split at 3.5KB
 * (browsers cap ~4KB/cookie). Refresh-rotation persists by setting fresh cookies.
 *
 * Security notes:
 *  - Tokens are encrypted AT REST in the browser; only the server can read them.
 *  - SameSite=Lax + HttpOnly + Secure: JS can't read them, cross-site POSTs don't carry them.
 *  - A guest's generation/announce spends THEIR OWN org's credits — by OAuth consent.
 */
import crypto from "crypto";

const SECRET_HEX = process.env.SESSION_SECRET ?? "";
if (process.env.NODE_ENV === "production" && SECRET_HEX.length < 32) {
  // fail loud at boot rather than minting forgeable sessions in prod
  console.error("SESSION_SECRET missing/weak — set a 64-char hex secret");
}
const KEY = crypto.createHash("sha256").update(SECRET_HEX || "dev-only-insecure-key").digest();

export interface SessionRec {
  client_id: string;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  saved_at: string;
}
export interface SessionCtx { rec: SessionRec; dirty: boolean; isOwner?: boolean; }

const PREFIX = "fb_sess";
const CHUNK = 3500;
const MAX_CHUNKS = 3;

const b64u = (b: Buffer) => b.toString("base64url");
const ub64 = (s: string) => Buffer.from(s, "base64url");

export function encodeSession(rec: SessionRec): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(rec), "utf8"), cipher.final()]);
  return b64u(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

export function decodeSession(blob: string): SessionRec | null {
  try {
    const raw = ub64(blob);
    const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const rec = JSON.parse(Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8"));
    if (!rec?.access_token || !rec?.refresh_token || !rec?.client_id) return null;
    return rec;
  } catch { return null; }
}

/** Rebuild a session from request cookies (chunked). get(name) => cookie value | undefined. */
export function sessionFromCookies(get: (name: string) => string | undefined): SessionCtx | null {
  let blob = get(PREFIX) ?? "";
  for (let i = 0; i < MAX_CHUNKS; i++) {
    const part = get(`${PREFIX}.${i}`);
    if (part) blob += part;
  }
  if (!blob) return null;
  const rec = decodeSession(blob);
  return rec ? { rec, dirty: false } : null;
}

const cookieFlags = "Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000"; // 30d (refresh-token lifetime)

/** Serialize Set-Cookie headers to (re)write the full session. */
export function sessionSetCookies(rec: SessionRec): string[] {
  const blob = encodeSession(rec);
  const head = blob.slice(0, CHUNK);
  const chunks: string[] = [];
  for (let i = CHUNK; i < blob.length && chunks.length < MAX_CHUNKS; i += CHUNK) chunks.push(blob.slice(i, i + CHUNK));
  const out = [`${PREFIX}=${head}; ${cookieFlags}`];
  chunks.forEach((c, i) => out.push(`${PREFIX}.${i}=${c}; ${cookieFlags}`));
  // clear any stale higher chunks from a previously larger session
  for (let i = chunks.length; i < MAX_CHUNKS; i++) out.push(`${PREFIX}.${i}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
  return out;
}

export function sessionClearCookies(): string[] {
  const out = [`${PREFIX}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`];
  for (let i = 0; i < MAX_CHUNKS; i++) out.push(`${PREFIX}.${i}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`);
  return out;
}

/** Attach current session (only if rotated mid-request) to a Response. */
export function persistSessionIfDirty(res: Response, ctx: SessionCtx): Response {
  if (!ctx.dirty) return res;
  for (const c of sessionSetCookies(ctx.rec)) res.headers.append("Set-Cookie", c);
  return res;
}
