"use client";

import { forwardRef, useId } from "react";
import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, hint, error, id, children, ...props }, ref) => {
    const generatedId = useId();
    const selectId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "h-10 w-full appearance-none rounded-lg border border-zinc-200 bg-white px-3 pr-9 text-sm text-zinc-900 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-graphite-700/60 dark:bg-graphite-700 dark:text-white",
              error && "border-red-400 focus:border-red-500 focus:ring-red-100",
              className
            )}
            aria-invalid={!!error}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        </div>
        {(hint || error) && (
          <p className={cn("text-xs", error ? "text-red-600" : "text-zinc-500 dark:text-zinc-400")}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  }
);
Select.displayName = "Select";
