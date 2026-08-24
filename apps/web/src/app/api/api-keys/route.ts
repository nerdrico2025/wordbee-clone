import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { saveApiKeySchema } from "@/lib/validators";
import { listApiKeyCards, saveApiKey } from "@/lib/api-keys";
import { AiProviderError } from "@wordbee/shared";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const cards = await listApiKeyCards(session.user.id);
  return NextResponse.json(cards);
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = saveApiKeySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    await saveApiKey(session.user.id, parsed.data.provider, parsed.data.capability, parsed.data.apiKey);
  } catch (err) {
    if (err instanceof AiProviderError) {
      return NextResponse.json({ error: err.userMessage }, { status: 400 });
    }
    throw err;
  }

  const cards = await listApiKeyCards(session.user.id);
  return NextResponse.json(cards);
}
