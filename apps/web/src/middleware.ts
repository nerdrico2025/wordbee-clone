import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "wordbee_session";
const PUBLIC_API_PATHS = new Set(["/api/auth/login"]);
const PUBLIC_PAGE_PATHS = new Set(["/login"]);

/**
 * Prefixos públicos por natureza. Hoje só `/r/` — os links rastreados da
 * distribuição, que precisam abrir para qualquer visitante que clicou no
 * comentário de um grupo (é literalmente o objetivo deles). A rota em si é
 * deliberadamente burra e não expõe dado nenhum do usuário: conta o clique
 * e redireciona. Ver `app/r/[code]/route.ts`.
 */
const PUBLIC_PATH_PREFIXES = ["/r/"];

/**
 * Checagem "de perímetro", rápida e apenas de assinatura/expiração do JWT
 * (Edge runtime, sem acesso a Postgres). A checagem autoritativa — que
 * também confere revogação da sessão no banco — acontece em
 * `getCurrentSession()` (Node.js runtime), chamada pelo layout protegido e
 * por cada rota de API. Ver lib/auth.ts.
 */
async function hasValidSessionCookie(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isPublic = PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))
    ? true
    : isApi
      ? PUBLIC_API_PATHS.has(pathname)
      : PUBLIC_PAGE_PATHS.has(pathname);

  const authenticated = await hasValidSessionCookie(req);

  if (!isPublic && !authenticated) {
    if (isApi) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === "/login" && authenticated) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads/).*)"],
};
