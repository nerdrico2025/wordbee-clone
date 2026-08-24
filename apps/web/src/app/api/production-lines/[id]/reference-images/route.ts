import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { addReferenceImage } from "@/lib/production-lines";

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
