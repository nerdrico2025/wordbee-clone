import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { verifyPassword, verifyTotpToken } from "@wordbee/shared";
import { createSession, setSessionCookie } from "@/lib/auth";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { loginSchema } from "@/lib/validators";

function getClientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const maxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX_ATTEMPTS ?? "5");
  const windowSeconds = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MINUTES ?? "15") * 60;
  const rateLimitKey = `login:${ip}`;

  const rate = await checkRateLimit(rateLimitKey, maxAttempts, windowSeconds);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: `Muitas tentativas de login. Tente novamente em ${Math.ceil(rate.retryAfterSeconds / 60)} min.`,
      },
      { status: 429 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }
  const { email, password, totpCode } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  const genericError = () =>
    NextResponse.json({ error: "E-mail ou senha inválidos." }, { status: 401 });

  if (!user) {
    // Não conta a tentativa de novo aqui: já foi contada pelo checkRateLimit
    // do topo desta função. Chamar de novo tanto duplicava o consumo do
    // rate limit para tentativas com e-mail inexistente (2 comandos Redis
    // extras por request) quanto inflava indevidamente o contador dessas
    // tentativas (2x mais rápido pro limite do que uma tentativa com e-mail
    // válido). Ver DECISIONS.md "redução de comandos Redis" (2026-08-29).
    return genericError();
  }

  const validPassword = await verifyPassword(user.senhaHash, password);
  if (!validPassword) {
    return genericError();
  }

  if (user.totpEnabled) {
    if (!totpCode) {
      return NextResponse.json({ requiresTotp: true });
    }
    if (!user.totpSecret || !verifyTotpToken(user.totpSecret, totpCode)) {
      return NextResponse.json({ error: "Código de verificação inválido." }, { status: 401 });
    }
  }

  await resetRateLimit(rateLimitKey);

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(token, expiresAt);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, nome: user.nome, email: user.email, temaUi: user.temaUi },
  });
}
