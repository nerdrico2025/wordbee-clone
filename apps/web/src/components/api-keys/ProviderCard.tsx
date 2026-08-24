"use client";

import { useState, type FormEvent } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PasswordInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { ApiKeyCard, Capability } from "@/lib/api-keys";

export function ProviderCard({
  card,
  capability,
  onSaved,
}: {
  card: ApiKeyCard;
  capability: Capability;
  onSaved: (cards: { texto: ApiKeyCard[]; imagem: ApiKeyCard[] }) => void;
}) {
  const { toast } = useToast();
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: card.provider, capability, apiKey: value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar a chave.");
      onSaved(data);
      setValue("");
      setSuccess(true);
      toast({ title: `Chave do ${card.nome} salva.`, description: "Validada com sucesso junto ao provedor.", variant: "success" });
    } catch (err) {
      const message = (err as Error).message;
      setError(message);
      toast({ title: `Não foi possível salvar a chave do ${card.nome}.`, description: message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-white">{card.nome}</h3>
            <Badge variant="purple">{card.modeloLabel}</Badge>
            {card.gratuito && <Badge variant="success">Gratuito</Badge>}
          </div>
          <a
            href={card.docsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:underline"
          >
            Como obter a chave <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{card.descricao}</p>
        {card.gratuitoNota && <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">{card.gratuitoNota}</p>}

        <div className="mt-3">
          {card.configured ? (
            <p className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-300">
              <KeyRound className="h-3.5 w-3.5 text-emerald-500" />
              Chave configurada: <span className="font-mono">{card.maskedKey}</span>
            </p>
          ) : (
            <p className="text-sm text-amber-600 dark:text-amber-400">⚠ Nenhuma chave configurada</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <PasswordInput
              aria-label={`Chave de API do ${card.nome}`}
              placeholder={card.keyPrefixPlaceholder}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {success && !error && <p className="mt-2 text-sm text-emerald-600">Chave validada e salva com sucesso.</p>}
      </CardContent>
    </Card>
  );
}
