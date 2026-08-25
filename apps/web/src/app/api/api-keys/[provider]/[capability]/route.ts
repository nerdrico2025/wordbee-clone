import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { apiKeyRouteParamsSchema } from "@/lib/validators";
import { listApiKeyCards, deleteApiKey } from "@/lib/api-keys";

export async function DELETE(_req: NextRequest, { params }: { params: { provider: string; capability: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = apiKeyRouteParamsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Provedor ou capacidade inválidos." }, { status: 400 });
  }

  // Idempotente: remover uma chave que já não existe não é erro.
  await deleteApiKey(session.user.id, parsed.data.provider, parsed.data.capability);

  const cards = await listApiKeyCards(session.user.id);
  return NextResponse.json(cards);
}
