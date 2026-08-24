import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateTitleQueueItemSchema } from "@/lib/validators";

export async function PATCH(req: NextRequest, { params }: { params: { id: string; titleId: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const line = await prisma.productionLine.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!line) return NextResponse.json({ error: "Linha não encontrada." }, { status: 404 });

  const item = await prisma.titleQueueItem.findFirst({ where: { id: params.titleId, lineId: params.id } });
  if (!item) return NextResponse.json({ error: "Título não encontrado." }, { status: 404 });
  if (item.status !== "NA_FILA") {
    return NextResponse.json({ error: "Só é possível editar títulos que ainda estão na fila." }, { status: 400 });
  }

  const json = await req.json().catch(() => null);
  const parsed = updateTitleQueueItemSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });

  const updated = await prisma.titleQueueItem.update({ where: { id: params.titleId }, data: { titulo: parsed.data.titulo } });
  return NextResponse.json({ item: updated });
}
