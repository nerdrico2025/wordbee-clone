import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { generateArticleSchema } from "@/lib/validators";
import { runUnitArticlePipeline } from "@/lib/article-pipeline";

// Precisa ser maior que o maior timeout de provider de IA usado no
// pipeline (hoje 90s, geração de artigo via OpenRouter — ver
// ARTICLE_TIMEOUT_MS em packages/shared/src/ai/openrouter.ts), senão a
// plataforma cortaria a função antes do provider ter chance de responder
// (ou de lançar seu próprio erro de timeout com mensagem clara). Só tem
// efeito real na Vercel (Functions serverless); na Railway (`next start`
// como processo Node comum) esse export é ignorado, e o limite relevante
// vira o `requestTimeout` default do Node (5 min) — também confortavelmente
// maior que 90s.
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
