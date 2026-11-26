import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { aiModelCatalogQuerySchema } from "@/lib/validators";
import { getDecryptedApiKey } from "@/lib/api-keys";
import { getOpenRouterCatalog } from "@/lib/ai-model-settings";

/**
 * Catálogo de modelos do OpenRouter (texto ou imagem) para o combobox da
 * tela. Se a busca falhar, devolve 200 com lista vazia — a tela continua
 * aceitando um ID digitado à mão.
 */
export async function GET(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = aiModelCatalogQuerySchema.safeParse({ tipo: new URL(req.url).searchParams.get("tipo") });
  if (!parsed.success) return NextResponse.json({ error: "Tipo de modelo inválido." }, { status: 400 });

  try {
    const apiKey = await getDecryptedApiKey(session.user.id, "OPENROUTER", parsed.data.tipo === "texto" ? "TEXTO" : "IMAGEM");
    const modelos = await getOpenRouterCatalog(parsed.data.tipo === "texto" ? "text" : "image", apiKey);
    return NextResponse.json({ modelos });
  } catch (err) {
    console.error("[ai-models/catalog] falha ao buscar catálogo do OpenRouter:", err);
    return NextResponse.json({ modelos: [], erro: "Não foi possível carregar a lista de modelos agora. Você ainda pode digitar o ID." });
  }
}
