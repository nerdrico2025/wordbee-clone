"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function Header({ nome, onMenuClick }: { nome: string; onMenuClick: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 dark:border-graphite-700/60 dark:bg-graphite-800 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          aria-label="Abrir menu"
          className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/5 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <p className="text-sm font-semibold text-zinc-900 dark:text-white">Olá, {nome} 👋</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Bem-vindo ao seu painel</p>
        </div>
      </div>
      <ThemeToggle />
    </header>
  );
}
