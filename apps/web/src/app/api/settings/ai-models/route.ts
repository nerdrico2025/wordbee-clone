import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { saveAiModelsSchema } from "@/lib/validators";
import { getAiModelsView, saveAiModelSettings } from "@/lib/ai-model-settings";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  return NextResponse.json(await getAiModelsView(session.user.id));
}

export async function PUT(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = saveAiModelsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  return NextResponse.json(await saveAiModelSettings(session.user.id, parsed.data));
}
