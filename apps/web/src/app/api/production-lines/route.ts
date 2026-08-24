import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { createProductionLineSchema } from "@/lib/validators";
import { createProductionLine } from "@/lib/production-lines";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createProductionLineSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const line = await createProductionLine(session.user.id, parsed.data);
    return NextResponse.json({ line });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao criar linha." }, { status: 400 });
  }
}
