"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full bg-zinc-200 outline-none transition-colors data-[state=checked]:bg-primary-600 focus-visible:ring-2 focus-visible:ring-primary-300 dark:bg-white/10",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}
