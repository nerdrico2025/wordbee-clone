"use client";

import { useState, type FormEvent } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { PasswordInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function PasswordSection() {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A confirmação não confere com a nova senha.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/profile/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível trocar a senha.");

      toast({
        title: "Senha alterada com sucesso.",
        description: "As demais sessões ativas foram encerradas por segurança.",
        variant: "success",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trocar senha</CardTitle>
        <CardDescription>Ao trocar a senha, as demais sessões ativas são encerradas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 sm:max-w-sm">
          <PasswordInput
            label="Senha atual"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <PasswordInput
            label="Nova senha"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <PasswordInput
            label="Confirmar nova senha"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button type="submit" loading={loading} className="self-start">
            Atualizar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
