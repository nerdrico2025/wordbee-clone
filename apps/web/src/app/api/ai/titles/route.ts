import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { generateTitlesSchema } from "@/lib/validators";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { createTextProvider, resolveModelId, AiProviderError } from "@wordbee/shared";
import { getAiModelSettings } from "@/lib/ai-model-settings";

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = generateTitlesSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const { tipo, tema, iaTexto, titulosExistentes } = parsed.data;

  const apiKey = await getDecryptedApiKey(session.user.id, iaTexto, "TEXTO");
  if (!apiKey) {
    return NextResponse.json({ error: "Nenhuma chave de IA de texto configurada para este provedor." }, { status: 400 });
  }

  try {
    const modelId = resolveModelId("text", iaTexto, await getAiModelSettings(session.user.id));
    const provider = createTextProvider(iaTexto, apiKey, modelId);
    const titulos = await provider.generateTitles({ tipo, tema, quantidade: 5, titulosExistentes });
    return NextResponse.json({ titulos });
  } catch (err) {
    if (err instanceof AiProviderError) {
      return NextResponse.json({ error: err.userMessage }, { status: 400 });
    }
    throw err;
  }
}
