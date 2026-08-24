"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export interface DashboardShellProps {
  user: { nome: string; email: string };
  children: ReactNode;
}

export function DashboardShell({ user, children }: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-surface dark:bg-surface-dark">
      <div className="hidden lg:block">
        <Sidebar user={user} />
      </div>

      <Dialog.Root open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <Dialog.Content
            className="fixed inset-y-0 left-0 z-50 lg:hidden"
            aria-describedby={undefined}
          >
            <Dialog.Title className="sr-only">Menu de navegação</Dialog.Title>
            <Sidebar user={user} onNavigate={() => setMobileNavOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <div className="flex min-w-0 flex-1 flex-col">
        <Header nome={user.nome} onMenuClick={() => setMobileNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
