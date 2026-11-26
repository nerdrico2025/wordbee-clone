import { NextResponse, type NextRequest } from "next/server";
import { testOpenRouterModel } from "@wordbee/shared";
import { getCurrentSession } from "@/lib/auth";
import { testAiModelSchema } from "@/lib/validators";
import { getDecryptedApiKey } from "@/lib/api-keys";

/**
 * Testa o modelo escolhido antes de salvar. Texto: uma chamada mínima (uma
 * palavra de resposta). Imagem: só confere que o modelo existe na Image API
 * do OpenRouter — não gera imagem, para não gastar créditos à toa.
 */
export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = testAiModelSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const { tipo, modelId } = parsed.data;
  const apiKey = await getDecryptedApiKey(session.user.id, "OPENROUTER", tipo === "texto" ? "TEXTO" : "IMAGEM");
  if (!apiKey) {
    return NextResponse.json({ error: "Cadastre a chave do OpenRouter acima antes de testar um modelo." }, { status: 400 });
  }

  const result = await testOpenRouterModel(tipo === "texto" ? "text" : "image", apiKey, modelId);
  return NextResponse.json(result);
}
