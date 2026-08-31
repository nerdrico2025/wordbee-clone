import { NextResponse, type NextRequest } from "next/server";
import { Prisma, prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { createFacebookPageSchema } from "@/lib/validators";
import { encryptPageToken, FACEBOOK_PAGE_SELECT, toFacebookPageSummary } from "@/lib/facebook-pages";
import { validatePageToken, FacebookError } from "@wordbee/shared";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const pages = await prisma.facebookPage.findMany({
    where: { userId: session.user.id },
    orderBy: { nome: "asc" },
    select: FACEBOOK_PAGE_SELECT,
  });
  return NextResponse.json({ pages: pages.map(toFacebookPageSummary) });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createFacebookPageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const pageId = parsed.data.pageId.trim();
  const accessToken = parsed.data.accessToken.trim();
  const wpSiteId = parsed.data.wpSiteId?.trim() || null;

  if (wpSiteId) {
    const site = await prisma.wpSite.findFirst({ where: { id: wpSiteId, userId: session.user.id }, select: { id: true } });
    if (!site) return NextResponse.json({ error: "Site WordPress selecionado não encontrado." }, { status: 400 });
  }

  // Mesma regra de `api_keys` (RF-15): uma credencial inválida NUNCA é
  // persistida. A validação também confirma que o token enxerga exatamente
  // a Página informada — um token de outra Página falha aqui, e não só na
  // hora de publicar.
  try {
    await validatePageToken({ pageId, accessToken });
  } catch (err) {
    if (err instanceof FacebookError) return NextResponse.json({ error: err.userMessage }, { status: 400 });
    throw err;
  }

  const { accessTokenEncrypted, iv, authTag, maskedHint } = encryptPageToken(accessToken);

  try {
    const page = await prisma.facebookPage.create({
      data: {
        userId: session.user.id,
        nome: parsed.data.nome.trim(),
        pageId,
        accessTokenEncrypted,
        iv,
        authTag,
        maskedHint,
        statusValidacao: true,
        lastValidatedAt: new Date(),
        lastError: null,
        wpSiteId,
      },
      select: FACEBOOK_PAGE_SELECT,
    });
    return NextResponse.json({ page: toFacebookPageSummary(page) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Esta Página já está cadastrada." }, { status: 409 });
    }
    throw err;
  }
}
