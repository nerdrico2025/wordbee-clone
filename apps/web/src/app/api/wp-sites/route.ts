import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { createWpSiteSchema } from "@/lib/validators";
import { encryptAppPassword } from "@/lib/wp-sites";
import { WordPressError } from "@wordbee/shared";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sites = await prisma.wpSite.findMany({
    where: { userId: session.user.id },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, url: true, usuario: true, lastTestAt: true, lastTestOk: true, lastTestError: true },
  });
  return NextResponse.json({ sites });
}

export async function POST(req: NextRequest) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = createWpSiteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    // eslint-disable-next-line no-new
    new URL(parsed.data.url);
  } catch {
    return NextResponse.json({ error: "URL inválida." }, { status: 400 });
  }

  const { appPasswordEncrypted, iv, authTag } = encryptAppPassword(parsed.data.appPassword);

  try {
    const site = await prisma.wpSite.create({
      data: {
        userId: session.user.id,
        nome: parsed.data.nome,
        url: parsed.data.url.replace(/\/$/, ""),
        usuario: parsed.data.usuario,
        appPasswordEncrypted,
        iv,
        authTag,
      },
      select: { id: true, nome: true, url: true, usuario: true },
    });
    return NextResponse.json({ site });
  } catch (err) {
    if (err instanceof WordPressError) {
      return NextResponse.json({ error: err.userMessage }, { status: 400 });
    }
    throw err;
  }
}
