"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function Modal({ open, onOpenChange, title, description, children, footer, className }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-zinc-200 bg-white p-6 shadow-xl focus:outline-none dark:border-graphite-700/60 dark:bg-graphite-800",
            className
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-lg font-bold text-zinc-900 dark:text-white">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Fechar"
                className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/5"
              >
                <X className="h-5 w-5" />
              </button>
            </Dialog.Close>
          </div>
          <div>{children}</div>
          {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
