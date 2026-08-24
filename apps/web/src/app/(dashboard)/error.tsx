"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[painel] erro não tratado:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-zinc-200 bg-white py-16 text-center dark:border-graphite-700/60 dark:bg-graphite-800">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-500/10">
        <AlertTriangle className="h-7 w-7 text-red-600" />
      </div>
      <h2 className="text-base font-semibold text-zinc-900 dark:text-white">Algo deu errado</h2>
      <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        Não foi possível carregar esta página. Tente novamente em instantes.
      </p>
      <Button onClick={reset} className="mt-2">
        Tentar novamente
      </Button>
    </div>
  );
}
