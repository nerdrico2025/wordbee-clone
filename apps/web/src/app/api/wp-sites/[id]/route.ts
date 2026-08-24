import { NextResponse, type NextRequest } from "next/server";
import { Prisma, prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { updateWpSiteSchema } from "@/lib/validators";
import { encryptAppPassword } from "@/lib/wp-sites";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.wpSite.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = updateWpSiteSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.nome !== undefined) data.nome = parsed.data.nome;
  if (parsed.data.url !== undefined) data.url = parsed.data.url.replace(/\/$/, "");
  if (parsed.data.usuario !== undefined) data.usuario = parsed.data.usuario;
  if (parsed.data.appPassword !== undefined) {
    const { appPasswordEncrypted, iv, authTag } = encryptAppPassword(parsed.data.appPassword);
    Object.assign(data, { appPasswordEncrypted, iv, authTag });
  }

  const site = await prisma.wpSite.update({
    where: { id: params.id },
    data,
    select: { id: true, nome: true, url: true, usuario: true },
  });
  return NextResponse.json({ site });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const existing = await prisma.wpSite.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Site não encontrado." }, { status: 404 });

  const linesCount = await prisma.productionLine.count({ where: { wpSiteId: params.id } });
  if (linesCount > 0) {
    return NextResponse.json(
      { error: `Existem ${linesCount} linha(s) de produção usando este site. Exclua ou reatribua as linhas antes de excluir o site.` },
      { status: 409 }
    );
  }

  try {
    await prisma.wpSite.delete({ where: { id: params.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({ error: "Este site ainda está em uso e não pode ser excluído." }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
