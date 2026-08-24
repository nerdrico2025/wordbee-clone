import type { HTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
        neutral: "bg-zinc-100 text-zinc-600 dark:bg-white/5 dark:text-zinc-300",
        purple: "bg-primary-100 text-primary-700 dark:bg-primary-500/10 dark:text-primary-300",
        danger: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
        warning: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
