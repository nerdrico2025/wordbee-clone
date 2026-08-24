"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (input: { title: string; description?: string; variant?: ToastVariant }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden />,
  error: <XCircle className="h-5 w-5 text-red-500" aria-hidden />,
  info: <Info className="h-5 w-5 text-primary-500" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback<ToastContextValue["toast"]>(({ title, description, variant = "info" }) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, title, description, variant }]);
  }, []);

  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            onOpenChange={(open) => !open && removeToast(t.id)}
            className={cn(
              "flex items-start gap-3 rounded-lg border bg-white p-4 shadow-lg dark:bg-graphite-800",
              t.variant === "error"
                ? "border-red-200 dark:border-red-900/50"
                : t.variant === "success"
                  ? "border-emerald-200 dark:border-emerald-900/50"
                  : "border-zinc-200 dark:border-graphite-700/60"
            )}
          >
            {ICONS[t.variant]}
            <div className="flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold text-zinc-900 dark:text-white">
                {t.title}
              </ToastPrimitive.Title>
              {t.description && (
                <ToastPrimitive.Description className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {t.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close aria-label="Fechar notificação" className="text-zinc-400 hover:text-zinc-600">
              <X className="h-4 w-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa ser usado dentro de <ToastProvider>");
  return ctx;
}
