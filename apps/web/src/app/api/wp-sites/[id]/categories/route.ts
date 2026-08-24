import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getSiteCredentials } from "@/lib/wp-sites";
import { listCategories, WordPressError } from "@wordbee/shared";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  try {
    const creds = await getSiteCredentials(session.user.id, params.id);
    const categories = await listCategories(creds);
    return NextResponse.json({ categories });
  } catch (err) {
    const message = err instanceof WordPressError ? err.userMessage : "Erro inesperado ao carregar categorias.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
