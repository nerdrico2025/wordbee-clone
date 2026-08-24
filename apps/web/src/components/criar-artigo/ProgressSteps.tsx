import { CheckCircle2, Loader2, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/cn";

export type StepState = "pending" | "active" | "done" | "error";

const STEPS: { key: string; label: string }[] = [
  { key: "titulo", label: "Título" },
  { key: "conteudo", label: "Conteúdo" },
  { key: "imagem", label: "Imagem" },
  { key: "publicando", label: "Publicando" },
];

export function ProgressSteps({ progress }: { progress: Record<string, StepState> }) {
  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map((step) => {
        const state = progress[step.key] ?? "pending";
        return (
          <li key={step.key} className="flex items-center gap-3">
            {state === "done" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            {state === "active" && <Loader2 className="h-5 w-5 animate-spin text-primary-600" />}
            {state === "error" && <XCircle className="h-5 w-5 text-red-500" />}
            {state === "pending" && <Circle className="h-5 w-5 text-zinc-300 dark:text-zinc-600" />}
            <span
              className={cn(
                "text-sm",
                state === "pending" ? "text-zinc-400" : "text-zinc-800 dark:text-zinc-100",
                state === "active" && "font-medium"
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
