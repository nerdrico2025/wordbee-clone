import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getDecryptedApiKey } from "@/lib/api-keys";
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

  const apiKey = await getDecryptedApiKey(session.user.id, "OPENROUTER", "TEXTO").catch(() => null);
  const view = await saveAiModelSettings(session.user.id, parsed.data, { apiKey });
  // Toda tela que mostra o modelo (Linhas, Criar Artigo, Chaves de API,
  // Histórico) é renderizada no servidor: invalida o cache delas. A tela
  // aberta em outra aba é avisada pelo cliente (useActiveModels).
  revalidatePath("/", "layout");
  return NextResponse.json(view);
}
