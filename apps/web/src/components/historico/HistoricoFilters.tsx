"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";

const STATUS_OPTIONS = [
  { value: "PUBLICADO", label: "Publicado" },
  { value: "RASCUNHO", label: "Rascunho" },
  { value: "FALHA", label: "Falha" },
  { value: "PROCESSANDO", label: "Processando" },
];

export function HistoricoFilters({
  sites,
  lines,
}: {
  sites: { id: string; nome: string }[];
  lines: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [busca, setBusca] = useState(searchParams.get("busca") ?? "");
  const [, startTransition] = useTransition();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <Input
        placeholder="Buscar por título..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && updateParam("busca", busca)}
        onBlur={() => updateParam("busca", busca)}
      />
      <Select aria-label="Filtrar por site" value={searchParams.get("site") ?? ""} onChange={(e) => updateParam("site", e.target.value)}>
        <option value="">Todos os sites</option>
        {sites.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </Select>
      <Select aria-label="Filtrar por status" value={searchParams.get("status") ?? ""} onChange={(e) => updateParam("status", e.target.value)}>
        <option value="">Todos os status</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Select aria-label="Filtrar por linha" value={searchParams.get("linha") ?? ""} onChange={(e) => updateParam("linha", e.target.value)}>
        <option value="">Todas as origens</option>
        <option value="manual">Manual</option>
        {lines.map((l) => (
          <option key={l.id} value={l.id}>
            {l.nome}
          </option>
        ))}
      </Select>
      <div className="flex gap-2">
        <Input aria-label="Data inicial" type="date" value={searchParams.get("de") ?? ""} onChange={(e) => updateParam("de", e.target.value)} />
        <Input aria-label="Data final" type="date" value={searchParams.get("ate") ?? ""} onChange={(e) => updateParam("ate", e.target.value)} />
      </div>
    </div>
  );
}
