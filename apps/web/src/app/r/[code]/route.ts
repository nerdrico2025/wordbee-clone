import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";

/**
 * Link rastreado: registra o clique e redireciona para o destino real.
 *
 * ROTA PÚBLICA, sem sessão — é ela que as pessoas abrem a partir do
 * comentário no grupo do Facebook (ver a exceção correspondente em
 * `middleware.ts`). Por ser pública, ela é deliberadamente burra: só sabe
 * procurar um código, contar +1 e redirecionar. Não lê nem devolve nada do
 * usuário, e não aceita nenhum parâmetro além do código.
 */
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const link = await prisma.distributionLink.findUnique({
    where: { code: params.code },
    select: { id: true, destinoUrl: true },
  });

  // Código inexistente vai para a home do app em vez de mostrar erro: quem
  // clicou é um visitante, não o dono — uma tela de erro técnica não ajuda
  // ninguém e ainda entrega que o link veio de uma ferramenta.
  if (!link) return NextResponse.redirect(new URL("/", _req.url), 302);

  // Guarda contra open redirect: `destinoUrl` é dado do próprio dono (URL
  // do blog dele), mas um redirect que aceita qualquer esquema seria um
  // ponto de abuso gratuito se algum dia esse campo vier de outro lugar.
  if (!/^https?:\/\//i.test(link.destinoUrl)) {
    return NextResponse.redirect(new URL("/", _req.url), 302);
  }

  // A contagem não pode atrasar nem quebrar o redirect: se o banco falhar,
  // a pessoa ainda tem que chegar no conteúdo. Perder um clique da métrica
  // é bem menos grave que perder a visita.
  await prisma.distributionLink
    .update({
      where: { id: link.id },
      data: { cliqueCount: { increment: 1 }, ultimoCliqueEm: new Date() },
    })
    .catch((err) => console.error("[distribuicao] falha ao contar clique do link:", err));

  return NextResponse.redirect(link.destinoUrl, 302);
}
