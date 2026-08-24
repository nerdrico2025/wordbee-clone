import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { resendArticle } from "@/lib/article-pipeline";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const result = await resendArticle(session.user.id, params.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, wpUrl: result.wpUrl });
}
