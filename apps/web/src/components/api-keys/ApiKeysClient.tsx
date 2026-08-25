"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import { ProviderCard } from "@/components/api-keys/ProviderCard";
import type { ApiKeyCard } from "@/lib/api-keys";

export function ApiKeysClient({ initial }: { initial: { texto: ApiKeyCard[]; imagem: ApiKeyCard[] } }) {
  const [cards, setCards] = useState(initial);

  return (
    <div>
      <Tabs defaultValue="texto">
        <TabsList>
          <TabsTrigger value="texto">IAs para Artigos</TabsTrigger>
          <TabsTrigger value="imagem">IAs para Imagens</TabsTrigger>
        </TabsList>

        <TabsContent value="texto">
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Escolha o provedor de IA para geração de texto dos seus artigos. O Gemini é gratuito!
          </p>
          <div className="flex flex-col gap-4">
            {cards.texto.map((card) => (
              <ProviderCard key={card.provider} card={card} capability="TEXTO" onSaved={setCards} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="imagem">
          <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
            Escolha o provedor de IA para geração de imagens dos seus artigos.
          </p>
          <div className="flex flex-col gap-4">
            {cards.imagem.map((card) => (
              <ProviderCard key={card.provider} card={card} capability="IMAGEM" onSaved={setCards} />
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-6 flex gap-3 rounded-card border border-zinc-200 bg-zinc-50 p-4 dark:border-graphite-700/60 dark:bg-white/5">
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary-600" />
        <div className="text-sm text-zinc-600 dark:text-zinc-300">
          <p className="font-semibold text-zinc-800 dark:text-zinc-100">Segurança das suas chaves</p>
          <p className="mt-1">
            Todas as chaves são criptografadas com AES-256-GCM antes de serem salvas e nunca são exibidas em texto
            puro depois de cadastradas. Um provedor que serve texto e imagem (OpenAI, Gemini, OpenRouter) usa a mesma
            chave nas duas abas — você só precisa cadastrar uma vez.
          </p>
        </div>
      </div>
    </div>
  );
}
