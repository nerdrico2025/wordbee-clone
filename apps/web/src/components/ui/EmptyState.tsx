import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-16 text-center", className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 dark:bg-white/5">
        <Icon className="h-7 w-7 text-zinc-400" aria-hidden />
      </div>
      <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{title}</h3>
      {description && <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
