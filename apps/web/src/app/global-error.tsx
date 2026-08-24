"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[#FAFAFA] px-4 text-center">
          <p className="text-sm font-semibold text-[#7C3AED]">Erro</p>
          <h1 className="text-2xl font-bold text-zinc-900">Algo deu errado</h1>
          <p className="text-sm text-zinc-500">Tente novamente em instantes.</p>
          <button
            onClick={reset}
            className="mt-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white"
          >
            Tentar novamente
          </button>
        </div>
      </body>
    </html>
  );
}
