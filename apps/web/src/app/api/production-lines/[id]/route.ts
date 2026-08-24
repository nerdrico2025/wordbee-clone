import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { pauseProductionLine, resumeProductionLine, deleteProductionLine } from "@/lib/production-lines";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const line = await prisma.productionLine.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      wpSite: { select: { nome: true } },
      referenceImages: { orderBy: { ordem: "asc" } },
      titleQueue: { where: { status: "NA_FILA" }, orderBy: { previstoPara: "asc" } },
      articles: { where: { status: { in: ["PUBLICADO", "RASCUNHO"] } }, orderBy: { publishedAt: "desc" }, take: 50 },
    },
  });
  if (!line) return NextResponse.json({ error: "Linha não encontrada." }, { status: 404 });

  return NextResponse.json({ line });
}

const patchSchema = z.object({ action: z.enum(["pause", "resume"]) });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });

  try {
    const line =
      parsed.data.action === "pause"
        ? await pauseProductionLine(session.user.id, params.id)
        : await resumeProductionLine(session.user.id, params.id);
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao atualizar linha." }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    await deleteProductionLine(session.user.id, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao excluir linha." }, { status: 400 });
  }
}
