import { NextResponse, type NextRequest } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { enfileirarDistribuicaoSchema } from "@/lib/validators";
import { enfileirarCombinacoes, toDataPrevista } from "@/lib/distribution";

/**
 * Coloca combinações perfil × grupo na fila de distribuição manual de um
 * dia. Cria também, para cada combinação, o link rastreado que vai na copy
 * do comentário — é o que permite medir depois qual grupo/perfil converte.
 *
 * Isto NÃO publica nada: só monta a lista de tarefas que a pessoa vai
 * executar à mão.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = enfileirarDistribuicaoSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 });
  }

  try {
    const resultado = await enfileirarCombinacoes(
      session.user.id,
      params.id,
      parsed.data.combinacoes,
      toDataPrevista(parsed.data.dataPrevista)
    );
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
