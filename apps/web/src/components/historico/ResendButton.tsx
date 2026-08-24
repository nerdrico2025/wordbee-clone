"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function ResendButton({ articleId, onResent }: { articleId: string; onResent: () => void }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch(`/api/articles/${articleId}/resend`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Falha ao reenviar.");
      toast({ title: "Artigo reenviado com sucesso.", variant: "success" });
      onResent();
    } catch (err) {
      toast({ title: "Não foi possível reenviar.", description: (err as Error).message, variant: "error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={handleClick} loading={loading}>
      <RotateCw className="h-3.5 w-3.5" /> Reenviar
    </Button>
  );
}
