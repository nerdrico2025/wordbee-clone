import { NextResponse, type NextRequest } from "next/server";
import { Prisma, prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateFacebookPageSchema } from "@/lib/validators";
import { encryptPageToken, FACEBOOK_PAGE_SELECT, toFacebookPageSummary } from "@/lib/facebook-pages";
import { decrypt, validatePageToken, FacebookError } from "@wordbee/shared";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.facebookPage.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = updateFacebookPageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data: Prisma.FacebookPageUpdateInput = {};
  if (parsed.data.nome !== undefined) data.nome = parsed.data.nome.trim();

  if (parsed.data.wpSiteId !== undefined) {
    const wpSiteId = parsed.data.wpSiteId?.trim() || null;
    if (wpSiteId) {
      const site = await prisma.wpSite.findFirst({ where: { id: wpSiteId, userId: session.user.id }, select: { id: true } });
      if (!site) return NextResponse.json({ error: "Site WordPress selecionado não encontrado." }, { status: 400 });
      data.wpSite = { connect: { id: wpSiteId } };
    } else {
      data.wpSite = { disconnect: true };
    }
  }

  const novoPageId = parsed.data.pageId?.trim();
  const novoToken = parsed.data.accessToken?.trim();

  // Mudou o ID da Página ou o token? Revalida contra a Graph API antes de
  // gravar — o mesmo princípio do cadastro (nada inválido é persistido).
  // Trocar só o ID da Página mantendo o token antigo também precisa
  // revalidar: o token antigo pode não ter acesso à Página nova.
  if (novoPageId !== undefined || novoToken !== undefined) {
    const pageId = novoPageId ?? existing.pageId;
    const accessToken =
      novoToken ?? decrypt({ ciphertext: existing.accessTokenEncrypted, iv: existing.iv, authTag: existing.authTag });

    try {
      await validatePageToken({ pageId, accessToken });
    } catch (err) {
      if (err instanceof FacebookError) return NextResponse.json({ error: err.userMessage }, { status: 400 });
      throw err;
    }

    if (novoPageId !== undefined) data.pageId = pageId;
    if (novoToken !== undefined) {
      const { accessTokenEncrypted, iv, authTag, maskedHint } = encryptPageToken(accessToken);
      data.accessTokenEncrypted = accessTokenEncrypted;
      data.iv = iv;
      data.authTag = authTag;
      data.maskedHint = maskedHint;
    }
    data.statusValidacao = true;
    data.lastValidatedAt = new Date();
    data.lastError = null;
  }

  try {
    const page = await prisma.facebookPage.update({ where: { id: params.id }, data, select: FACEBOOK_PAGE_SELECT });
    return NextResponse.json({ page: toFacebookPageSummary(page) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Já existe outra Página cadastrada com esse ID." }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.facebookPage.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Página não encontrada." }, { status: 404 });

  // Cascade em `page_distribution_posts` (schema): excluir a Página também
  // apaga o histórico de publicações dela. É por isso que o diálogo de
  // confirmação da UI avisa quantas publicações vão junto — diferente de
  // `wp_sites`, que BLOQUEIA a exclusão, aqui não faz sentido deixar uma
  // Página cadastrada para sempre só porque publicou uma vez.
  await prisma.facebookPage.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
