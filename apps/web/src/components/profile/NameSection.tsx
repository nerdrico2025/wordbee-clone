"use client";

import { useState, type FormEvent } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function NameSection({ initialNome }: { initialNome: string }) {
  const { toast } = useToast();
  const [nome, setNome] = useState(initialNome);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: "Nome atualizado com sucesso.", variant: "success" });
    } catch (err) {
      toast({ title: "Não foi possível atualizar o nome.", description: (err as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados da conta</CardTitle>
        <CardDescription>Como seu nome aparece na saudação do painel.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input label="Nome de exibição" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <Button type="submit" loading={loading}>
            Salvar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
