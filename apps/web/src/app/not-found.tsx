import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface px-4 text-center dark:bg-surface-dark">
      <p className="text-sm font-semibold text-primary-600">404</p>
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">Página não encontrada</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        A página que você tentou acessar não existe ou foi movida.
      </p>
      <Link href="/" className="mt-2 text-sm font-semibold text-primary-600 hover:underline">
        Voltar ao painel
      </Link>
    </div>
  );
}
