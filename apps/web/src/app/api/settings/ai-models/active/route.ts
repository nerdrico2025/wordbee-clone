import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getActiveModels } from "@/lib/ai-model-settings";

// Sempre lido na hora: é o que as telas usam para revalidar o modelo ativo
// sem recarregar a página.
export const dynamic = "force-dynamic";

/** Modelo ativo (resolvido painel → env → padrão) por provedor, para as telas. */
export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  return NextResponse.json(await getActiveModels(session.user.id), { headers: { "Cache-Control": "no-store" } });
}
