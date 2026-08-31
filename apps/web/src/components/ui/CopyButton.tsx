"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/Button";

/**
 * Botão de copiar para a área de transferência.
 *
 * É o gesto central da fila de distribuição: a pessoa copia a descrição,
 * cola no Facebook, copia o comentário, cola no comentário. Por isso o
 * feedback visual ("Copiado!") importa — sem ele não dá para saber se o
 * clique pegou, e a pessoa cola o texto anterior sem perceber.
 *
 * `navigator.clipboard` exige contexto seguro (HTTPS ou localhost); o
 * fallback com `execCommand` cobre o caso de o app ser aberto por IP na
 * rede local, onde a API moderna simplesmente não existe.
 */
export function CopyButton({
  value,
  label = "Copiar",
  copiedLabel = "Copiado!",
  ...buttonProps
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
} & Omit<ButtonProps, "onClick" | "children">) {
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!copiado) return;
    const timer = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(timer);
  }, [copiado]);

  async function handleCopy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const area = document.createElement("textarea");
        area.value = value;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleCopy} {...buttonProps}>
      {copiado ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {copiado ? copiedLabel : label}
    </Button>
  );
}
