import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { deleteReferenceImage } from "@/lib/production-lines";

export async function DELETE(_req: Request, { params }: { params: { id: string; imageId: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    await deleteReferenceImage(session.user.id, params.id, params.imageId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao excluir imagem." }, { status: 400 });
  }
}
