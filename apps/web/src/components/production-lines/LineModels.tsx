import Link from "next/link";
import { Cpu } from "lucide-react";
import type { AiProviderName } from "@wordbee/shared";
import { NOTA_MODELO, TROCAR_MODELO_HREF, type ActiveModelsPayload } from "@/components/ai-models/active-models-logic";

/**
 * Modelo em uso pela linha (resolvido agora, não gravado na linha): a linha
 * guarda só o provedor; o modelo é global e lido a cada execução.
 */
export function LineModels({ iaTexto, iaImagem, activeModels }: { iaTexto: string; iaImagem: string; activeModels: ActiveModelsPayload }) {
  const texto = activeModels.texto[iaTexto as AiProviderName];
  const imagem = activeModels.imagem[iaImagem as AiProviderName];
  return (
    <div className="text-xs text-zinc-500 dark:text-zinc-400">
      <p className="flex items-start gap-1">
        <Cpu className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate" title={texto?.modelId}>
            Texto: <span className="text-zinc-700 dark:text-zinc-200">{texto?.label ?? iaTexto}</span>
          </span>
          <span className="block truncate" title={imagem?.modelId}>
            Imagem: <span className="text-zinc-700 dark:text-zinc-200">{imagem?.label ?? iaImagem}</span>
          </span>
        </span>
      </p>
      <p className="mt-0.5 text-zinc-400">
        {NOTA_MODELO}{" "}
        <Link href={TROCAR_MODELO_HREF} className="font-medium text-primary-600 hover:underline">
          Trocar modelo
        </Link>
      </p>
    </div>
  );
}
