import { NextResponse, type NextRequest } from "next/server";
import { Prisma, prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { createDistributionPackageSchema } from "@/lib/validators";
import { contarArtigosNoTema, diretoSiteRecomendado } from "@/lib/distribution";
import { MIN_ARTIGOS_DIRETO_SITE } from "@/lib/distribution-types";

/**
 * Cria um pacote de distribuição sob demanda, a partir de um artigo já
 * publicado. O pacote nasce PENDENTE e sem conteúdo: quem gera as copies e
 * as imagens é o worker, no próximo tick — mesma divisão do trilho
 * automático (a geração de IA nunca roda dentro da função serverless).
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createDistributionPackageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const artigo = await prisma.article.findFirst({
    where: { id: parsed.data.articleId, userId: session.user.id },
    select: { id: true, status: true, wpUrl: true, wpSiteId: true, tema: true },
  });
  if (!artigo) return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 });
  if (artigo.status !== "PUBLICADO" || !artigo.wpUrl) {
    return NextResponse.json({ error: "Só artigos publicados podem virar pacote de distribuição." }, { status: 400 });
  }

  // Regra da Aula 4: mandar tráfego para a busca do blog só compensa quando
  // o tema já tem vários artigos — uma busca com um resultado só entrega
  // uma página quase vazia. A checagem é aqui (não no worker) porque é uma
  // decisão do usuário no momento de criar o pacote.
  if (parsed.data.tipo === "DIRETO_SITE") {
    const artigosNoTema = await contarArtigosNoTema(session.user.id, artigo.wpSiteId, artigo.tema);
    if (!diretoSiteRecomendado(artigosNoTema)) {
      return NextResponse.json(
        {
          error: `Este tema tem só ${artigosNoTema} artigo(s) publicado(s). O pacote "direto pro site" leva à busca do blog, que precisa de pelo menos ${MIN_ARTIGOS_DIRETO_SITE} artigos no tema para valer a pena.`,
        },
        { status: 400 }
      );
    }
  }

  try {
    const pacote = await prisma.distributionPackage.create({
      data: {
        userId: session.user.id,
        articleId: artigo.id,
        tipo: parsed.data.tipo,
        status: "PENDENTE",
        imagens: [],
        imagensAlvo: parsed.data.imagensAlvo ?? 1,
      },
      select: { id: true },
    });
    return NextResponse.json({ packageId: pacote.id });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "Este artigo já tem um pacote desse tipo." }, { status: 409 });
    }
    throw err;
  }
}
