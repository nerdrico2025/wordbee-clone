import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { generateArticleSchema } from "@/lib/validators";
import { runUnitArticlePipeline } from "@/lib/article-pipeline";

// Precisa ser >= o maior timeout possível de provider de IA usado no
// pipeline, senão a plataforma cortaria a função antes do provider ter
// chance de responder (ou de lançar seu próprio erro de timeout com
// mensagem clara). OpenRouter (texto) usa `fetchStreamedTextOrThrow`
// (`packages/shared/src/ai/http.ts`) com timeout de INATIVIDADE (20s sem
// chunk novo), não um teto fixo — mas ainda tem um teto absoluto de
// segurança de 5min (300s) pra uma conexão com chunks esporádicos que nunca
// fica ociosa o bastante pra estourar o idle timeout, mas também nunca
// termina. Esse teto de 300s é IGUAL a este `maxDuration`, não
// confortavelmente menor como era com o timeout fixo antigo (90s) — um
// caso extremo em que o teto absoluto do http.ts dispare por último deixa
// a função quase sem margem pra responder antes da própria Vercel cortar.
// Aceito como risco residual baixo (exigiria chunks quase contínuos por
// ~5min sem o texto terminar, cenário extremo) em vez de reduzir o teto de
// segurança do http.ts abaixo do valor pedido. Ver DECISIONS.md
// (2026-08-27). Só tem efeito real na Vercel (Functions serverless); na
// Railway (`next start` como processo Node comum) esse export é ignorado, e
// o limite relevante vira o `requestTimeout` default do Node (5 min).
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = generateArticleSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const userId = session.user.id;
  const input = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runUnitArticlePipeline({ ...input, userId })) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro inesperado.";
        controller.enqueue(encoder.encode(`${JSON.stringify({ step: "erro", status: "error", message })}\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
