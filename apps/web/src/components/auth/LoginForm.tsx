"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, totpCode: requiresTotp ? totpCode : undefined }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Não foi possível entrar.");
        return;
      }
      if (data.requiresTotp) {
        setRequiresTotp(true);
        return;
      }

      const from = searchParams.get("from");
      router.push(from && from !== "/login" ? from : "/");
      router.refresh();
    } catch {
      setError("Erro de conexão. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-sidebar-gradient px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-gradient">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <span className="text-2xl font-extrabold tracking-tight text-white">WORDBEE</span>
        </div>

        <div className="rounded-card border border-white/10 bg-white p-6 shadow-xl dark:bg-graphite-800">
          <h1 className="text-lg font-bold text-zinc-900 dark:text-white">Entrar</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Acesse o seu painel de automação de artigos.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
            {!requiresTotp && (
              <>
                <Input
                  label="E-mail"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <PasswordInput
                  label="Senha"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </>
            )}

            {requiresTotp && (
              <Input
                label="Código de verificação"
                hint="Digite o código de 6 dígitos do seu app autenticador."
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                autoFocus
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value)}
              />
            )}

            {error && (
              <p role="alert" className="text-sm text-red-600">
                {error}
              </p>
            )}

            <Button type="submit" loading={loading} className="mt-2 w-full">
              {requiresTotp ? "Verificar código" : "Entrar"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
