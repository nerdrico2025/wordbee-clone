import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { generateLineTitlesSchema } from "@/lib/validators";
import { generateTitlesForLine } from "@/lib/production-lines";
import { AiProviderError } from "@wordbee/shared";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = generateLineTitlesSchema.safeParse(json ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });

  try {
    await generateTitlesForLine(session.user.id, params.id, parsed.data.quantidade ?? 3);
  } catch (err) {
    if (err instanceof AiProviderError) {
      return NextResponse.json({ error: err.userMessage }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao gerar títulos." }, { status: 400 });
  }

  const titleQueue = await prisma.titleQueueItem.findMany({
    where: { lineId: params.id, status: "NA_FILA" },
    orderBy: { previstoPara: "asc" },
  });
  return NextResponse.json({ titleQueue });
}
