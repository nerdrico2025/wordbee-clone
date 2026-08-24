"use client";

import { forwardRef, useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            "min-h-24 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-graphite-700/60 dark:bg-graphite-700 dark:text-white dark:placeholder:text-zinc-500",
            error && "border-red-400 focus:border-red-500 focus:ring-red-100",
            className
          )}
          aria-invalid={!!error}
          {...props}
        />
        {(hint || error) && (
          <p className={cn("text-xs", error ? "text-red-600" : "text-zinc-500 dark:text-zinc-400")}>
            {error ?? hint}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";
