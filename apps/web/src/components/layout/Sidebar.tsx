"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PenSquare,
  Workflow,
  History,
  Globe,
  KeyRound,
  User,
  LogOut,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/criar-artigo", label: "Criar Artigo", icon: PenSquare },
  { href: "/linhas-de-producao", label: "Linhas de Produção", icon: Workflow },
  { href: "/historico", label: "Histórico", icon: History },
  { href: "/sites-wordpress", label: "Sites WordPress", icon: Globe },
  { href: "/chaves-de-api", label: "Chaves de API", icon: KeyRound },
  { href: "/perfil", label: "Perfil", icon: User },
];

export interface SidebarProps {
  user: { nome: string; email: string };
  onNavigate?: () => void;
}

export function Sidebar({ user, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 flex-col bg-sidebar-gradient text-zinc-200">
      <div className="flex items-center gap-2 px-5 pb-6 pt-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-gradient">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <span className="text-lg font-extrabold tracking-tight text-white">WORDBEE</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Menu</p>
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary-600 text-white shadow-sm"
                      : "text-zinc-300 hover:bg-white/5 hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-sm font-semibold text-white">
            {user.nome.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.nome}</p>
            <p className="truncate text-xs text-zinc-400">{user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            aria-label="Sair"
            title="Sair"
            className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
