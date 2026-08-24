import { randomBytes, createHash } from "node:crypto";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

export interface SessionTokenPayload extends JWTPayload {
  sub: string; // userId
  sid: string; // sessionId (referencia a linha em `sessions`)
}

function getSecretKey(rawSecret: string | undefined = process.env.SESSION_SECRET): Uint8Array {
  if (!rawSecret || rawSecret.length < 32) {
    throw new Error(
      "SESSION_SECRET não configurado ou muito curto (mínimo 32 caracteres). Gere um com: openssl rand -base64 48"
    );
  }
  return new TextEncoder().encode(rawSecret);
}

export function generateSessionId(): string {
  return randomBytes(24).toString("hex");
}

/** Hash determinístico do sessionId, usado para localizar a sessão no banco sem guardar o valor bruto. */
export function hashSessionId(sessionId: string): string {
  return createHash("sha256").update(sessionId).digest("hex");
}

export async function signSessionToken(
  payload: { userId: string; sessionId: string },
  ttlSeconds: number
): Promise<string> {
  const secret = getSecretKey();
  return new SignJWT({ sub: payload.userId, sid: payload.sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  try {
    const secret = getSecretKey();
    const { payload } = await jwtVerify(token, secret);
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return payload as SessionTokenPayload;
  } catch {
    return null;
  }
}
