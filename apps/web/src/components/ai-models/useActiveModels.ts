"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_MODELS_UPDATED_CHANNEL, type ActiveModelsPayload } from "./active-models-logic";

/**
 * Modelo ativo por provedor, revalidado sem recarregar a página: ao montar,
 * ao voltar o foco para a aba e quando Modelos de IA avisa (BroadcastChannel)
 * que salvou. `initial` vem do servidor; falha de rede mantém o último valor.
 */
export function useActiveModels(initial: ActiveModelsPayload | null = null) {
  const [ativos, setAtivos] = useState<ActiveModelsPayload | null>(initial);

  const revalidar = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/ai-models/active", { cache: "no-store" });
      if (!res.ok) return;
      setAtivos((await res.json()) as ActiveModelsPayload);
    } catch {
      // mantém o último valor conhecido
    }
  }, []);

  useEffect(() => {
    void revalidar();
    const onFocus = () => void revalidar();
    window.addEventListener("focus", onFocus);
    let canal: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      canal = new BroadcastChannel(AI_MODELS_UPDATED_CHANNEL);
      canal.onmessage = () => void revalidar();
    }
    return () => {
      window.removeEventListener("focus", onFocus);
      canal?.close();
    };
  }, [revalidar]);

  return ativos;
}

/** Chamado por Modelos de IA depois de salvar: avisa as outras abas abertas. */
export function notifyActiveModelsChanged(): void {
  if (typeof BroadcastChannel === "undefined") return;
  const canal = new BroadcastChannel(AI_MODELS_UPDATED_CHANNEL);
  canal.postMessage({ at: Date.now() });
  canal.close();
}
