"use client";

import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, hint, error, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-graphite-700/60 dark:bg-graphite-700 dark:text-white dark:placeholder:text-zinc-500 dark:focus:ring-primary-900/40",
            error && "border-red-400 focus:border-red-500 focus:ring-red-100",
            className
          )}
          aria-invalid={!!error}
          aria-describedby={hint || error ? `${inputId}-desc` : undefined}
          {...props}
        />
        {(hint || error) && (
          <p
            id={`${inputId}-desc`}
            className={cn("text-xs", error ? "text-red-600" : "text-zinc-500 dark:text-zinc-400")}
          >
            {error ?? hint}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>((props, ref) => {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className="pr-10" {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute right-2.5 top-[34px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        tabIndex={0}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";
