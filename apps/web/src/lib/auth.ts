import "server-only";
import { cookies, headers } from "next/headers";
import { prisma } from "@wordbee/db";
import { signSessionToken, verifySessionToken, generateSessionId, hashSessionId } from "@wordbee/shared";

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "wordbee_session";

function sessionTtlSeconds(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? "168");
  return hours * 3600;
}

export interface CurrentSession {
  user: {
    id: string;
    nome: string;
    email: string;
    temaUi: string;
    totpEnabled: boolean;
  };
  sessionId: string;
}

/** Cria uma sessão no banco e retorna o token assinado (JWT) para o cookie. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const sessionId = generateSessionId();
  const ttl = sessionTtlSeconds();
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const hdrs = headers();
  const userAgent = hdrs.get("user-agent") ?? undefined;
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdrs.get("x-real-ip") ?? undefined;

  await prisma.session.create({
    data: {
      userId,
      tokenHash: hashSessionId(sessionId),
      userAgent,
      ip,
      expiresAt,
    },
  });

  const token = await signSessionToken({ userId, sessionId }, ttl);
  return { token, expiresAt };
}

export function setSessionCookie(token: string, expiresAt: Date) {
  cookies().set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearSessionCookie() {
  cookies().delete(SESSION_COOKIE_NAME);
}

/** Valida o cookie de sessão de forma autoritativa (JWT + registro no banco não revogado/expirado). */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const tokenHash = hashSessionId(payload.sid);
  const session = await prisma.session.findUnique({ where: { tokenHash } });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) return null;

  // Best-effort: mantém last_seen_at atualizado sem bloquear a resposta.
  prisma.session
    .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);

  return {
    sessionId: session.id,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      temaUi: user.temaUi,
      totpEnabled: user.totpEnabled,
    },
  };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.update({ where: { id: sessionId }, data: { revokedAt: new Date() } });
}

export async function revokeAllOtherSessions(userId: string, keepSessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, id: { not: keepSessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
