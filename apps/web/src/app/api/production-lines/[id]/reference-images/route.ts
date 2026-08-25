import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { addReferenceImage } from "@/lib/production-lines";

/**
 * Faltava um GET dedicado (só existia POST) — uma requisição GET pra essa
 * URL caía no 405 padrão do App Router pra método não implementado. O
 * detalhe da linha (`GET /api/production-lines/[id]`) já devolve
 * `referenceImages` embutido, mas nada impede um consumidor futuro (ou uma
 * chamada isolada) de bater direto aqui — melhor existir e devolver lista
 * vazia com 200 pra uma linha sem imagens do que 405/erro.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const line = await prisma.productionLine.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!line) return NextResponse.json({ error: "Linha não encontrada." }, { status: 404 });

  const images = await prisma.lineReferenceImage.findMany({ where: { lineId: params.id }, orderBy: { ordem: "asc" } });
  return NextResponse.json({ images });
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const image = await addReferenceImage(session.user.id, params.id, file.name, file.type, buffer);
    return NextResponse.json({ image });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao enviar imagem." }, { status: 400 });
  }
}
