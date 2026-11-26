"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronsUpDown, Loader2 } from "lucide-react";
import type { OpenRouterModelInfo } from "@wordbee/shared";
import { cn } from "@/lib/cn";
import { comboboxReducer, filterModels, formatModelPrice, type ComboboxAction } from "./model-combobox-logic";

export interface ModelComboboxProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  models: OpenRouterModelInfo[];
  loading?: boolean;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * Campo pesquisável de modelo: escolhe da lista do OpenRouter ou aceita um
 * ID digitado à mão (o texto do campo é o próprio ID salvo). Segue o padrão
 * WAI-ARIA de combobox com lista (setas, Enter, Esc).
 */
export function ModelCombobox({ id, label, value, onChange, models, loading, placeholder, hint, error, disabled }: ModelComboboxProps) {
  const listId = useId();
  const descId = `${id}-desc`;
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const visible = useMemo(() => filterModels(models, value), [models, value]);
  const visibleIds = visible.map((m) => m.id);

  function dispatch(action: ComboboxAction) {
    const next = comboboxReducer({ value, open, highlighted }, action, visibleIds);
    if (next.value !== value) onChange(next.value);
    setOpen(next.open);
    setHighlighted(next.highlighted);
    if (next.highlighted >= 0) {
      listRef.current?.querySelector(`[data-index="${next.highlighted}"]`)?.scrollIntoView({ block: "nearest" });
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      dispatch({ type: "move", delta: event.key === "ArrowDown" ? 1 : -1 });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      dispatch({ type: "enter" });
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      dispatch({ type: "close" });
    }
  }

  const activeId = open && highlighted >= 0 ? `${listId}-opt-${highlighted}` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-describedby={hint || error ? descId : undefined}
          aria-invalid={!!error}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={value}
          onChange={(e) => dispatch({ type: "type", text: e.target.value })}
          onFocus={() => dispatch({ type: "open" })}
          onBlur={() => setTimeout(() => dispatch({ type: "close" }), 120)}
          onKeyDown={onKeyDown}
          className={cn(
            "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 pr-9 font-mono text-sm text-zinc-900 placeholder:font-sans placeholder:text-zinc-400 transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-graphite-700/60 dark:bg-graphite-700 dark:text-white",
            error && "border-red-400 focus:border-red-500 focus:ring-red-100"
          )}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronsUpDown className="h-4 w-4" />}
        </span>

        {open && (
          <ul
            id={listId}
            ref={listRef}
            role="listbox"
            aria-label={label}
            className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-graphite-700/60 dark:bg-graphite-800"
          >
            {loading && <li className="px-3 py-2 text-sm text-zinc-500">Carregando modelos…</li>}
            {!loading && visible.length === 0 && (
              <li className="px-3 py-2 text-sm text-zinc-500">
                {models.length === 0
                  ? "Lista de modelos indisponível. Digite o ID do modelo."
                  : "Nenhum modelo encontrado. Você pode usar o ID digitado mesmo assim."}
              </li>
            )}
            {visible.map((m, index) => {
              const preco = formatModelPrice(m);
              return (
                <li
                  key={m.id}
                  id={`${listId}-opt-${index}`}
                  data-index={index}
                  role="option"
                  aria-selected={index === highlighted || m.id === value}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => dispatch({ type: "select", id: m.id })}
                  onMouseEnter={() => setHighlighted(index)}
                  className={cn(
                    "cursor-pointer px-3 py-2 text-sm",
                    index === highlighted ? "bg-primary-50 dark:bg-white/10" : "hover:bg-zinc-50 dark:hover:bg-white/5"
                  )}
                >
                  <div className="font-medium text-zinc-900 dark:text-white">{m.nome}</div>
                  <div className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{m.id}</div>
                  {preco && <div className="text-xs text-zinc-500 dark:text-zinc-400">{preco}</div>}
                </li>
              );
            })}
            {!loading && models.length > visible.length && visible.length > 0 && (
              <li className="px-3 py-1.5 text-xs text-zinc-400" aria-hidden>
                Mostrando {visible.length} de {models.length}. Digite para filtrar.
              </li>
            )}
          </ul>
        )}
      </div>
      {(hint || error) && (
        <p id={descId} className={cn("text-xs", error ? "text-red-600" : "text-zinc-500 dark:text-zinc-400")}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}
