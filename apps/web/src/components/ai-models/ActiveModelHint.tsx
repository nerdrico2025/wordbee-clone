import Link from "next/link";
import type { ModelDisplay } from "@wordbee/shared";
import { NOTA_MODELO, TROCAR_MODELO_HREF } from "./active-models-logic";

/** "Modelo ativo: X · Trocar modelo" abaixo do select de provedor (ou em cards). */
export function ActiveModelHint({ modelo, rotulo = "Modelo ativo", nota = true }: { modelo?: ModelDisplay; rotulo?: string; nota?: boolean }) {
  if (!modelo) return null;
  return (
    <div className="text-xs text-zinc-500 dark:text-zinc-400">
      <p className="truncate" title={modelo.modelId}>
        {rotulo}: <span className="font-medium text-zinc-700 dark:text-zinc-200">{modelo.nome}</span>{" "}
        · <Link href={TROCAR_MODELO_HREF} className="font-medium text-primary-600 hover:underline">Trocar modelo</Link>
      </p>
      {nota && <p className="mt-0.5 text-zinc-400">{NOTA_MODELO}</p>}
    </div>
  );
}
