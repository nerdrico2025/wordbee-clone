"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  function toggle() {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ temaUi: next }),
    }).catch(() => undefined);
  }

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden />;
  }

  return (
    <button
      onClick={toggle}
      aria-label={resolvedTheme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-graphite-700/60 dark:text-zinc-300 dark:hover:bg-white/5"
    >
      {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
