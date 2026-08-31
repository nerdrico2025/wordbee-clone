import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { upsertPerfilGrupoSchema } from "@/lib/validators";
import { GRUPO_INCLUDE, toGrupoSummary } from "@/lib/grupos-parceiros";
import { toDataPrevista } from "@/lib/distribution";

/**
 * Vincula (ou atualiza o vínculo de) um perfil de divulgação a um grupo
 * parceiro. É cadastro puro: registra que a pessoa participa daquele grupo,
 * para o app saber a quem pode atribuir uma tarefa de postagem manual.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const grupo = await prisma.grupoParceiro.findFirst({ where: { id: params.id, userId: session.user.id } });
  if (!grupo) return NextResponse.json({ error: "Grupo não encontrado." }, { status: 404 });

  const json = await req.json().catch(() => null);
  const parsed = upsertPerfilGrupoSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  const perfil = await prisma.divulgacaoPerfil.findFirst({
    where: { id: parsed.data.divulgacaoPerfilId, userId: session.user.id },
  });
  if (!perfil) return NextResponse.json({ error: "Perfil de divulgação não encontrado." }, { status: 400 });

  const status = parsed.data.status ?? "AGUARDANDO_APROVACAO";
  // Marcar como "já está no grupo" sem informar a data registra a data de
  // hoje: é a informação real (foi hoje que se soube), e deixar em branco
  // atrapalharia a leitura do histórico depois.
  const dataEntrada = parsed.data.dataEntrada
    ? toDataPrevista(parsed.data.dataEntrada)
    : status === "ENTROU" || status === "APROVADO"
      ? new Date()
      : null;

  await prisma.perfilGrupo.upsert({
    where: {
      divulgacaoPerfilId_grupoParceiroId: {
        divulgacaoPerfilId: parsed.data.divulgacaoPerfilId,
        grupoParceiroId: params.id,
      },
    },
    create: {
      divulgacaoPerfilId: parsed.data.divulgacaoPerfilId,
      grupoParceiroId: params.id,
      status,
      dataEntrada,
    },
    update: {
      status,
      ...(parsed.data.dataEntrada !== undefined || status === "ENTROU" || status === "APROVADO"
        ? { dataEntrada }
        : {}),
    },
  });

  const atualizado = await prisma.grupoParceiro.findUniqueOrThrow({ where: { id: params.id }, include: GRUPO_INCLUDE });
  return NextResponse.json({ grupo: toGrupoSummary(atualizado) });
}
