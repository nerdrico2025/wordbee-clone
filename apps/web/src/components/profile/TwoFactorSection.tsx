"use client";

import { useState } from "react";
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, PasswordInput } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";

export function TwoFactorSection({ initialEnabled }: { initialEnabled: boolean }) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);

  const [setupOpen, setSetupOpen] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const [disableOpen, setDisableOpen] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableLoading, setDisableLoading] = useState(false);
  const [disableError, setDisableError] = useState<string | null>(null);

  async function startSetup() {
    setSetupError(null);
    setSetupOpen(true);
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/totp/setup", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível iniciar a configuração.");
      setQrCodeDataUrl(data.qrCodeDataUrl);
      setSecret(data.secret);
    } catch (err) {
      setSetupError((err as Error).message);
    } finally {
      setSetupLoading(false);
    }
  }

  async function confirmSetup() {
    setSetupError(null);
    setSetupLoading(true);
    try {
      const res = await fetch("/api/auth/totp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Código inválido.");
      setEnabled(true);
      setSetupOpen(false);
      setCode("");
      toast({ title: "2FA ativado com sucesso.", variant: "success" });
    } catch (err) {
      setSetupError((err as Error).message);
    } finally {
      setSetupLoading(false);
    }
  }

  async function confirmDisable() {
    setDisableError(null);
    setDisableLoading(true);
    try {
      const res = await fetch("/api/auth/totp/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: disablePassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível desativar o 2FA.");
      setEnabled(false);
      setDisableOpen(false);
      setDisablePassword("");
      toast({ title: "2FA desativado.", variant: "success" });
    } catch (err) {
      setDisableError((err as Error).message);
    } finally {
      setDisableLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verificação em duas etapas (2FA)</CardTitle>
        <CardDescription>Adicione uma camada extra de segurança usando um app autenticador (TOTP).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-zinc-400" />
            <Badge variant={enabled ? "success" : "neutral"}>{enabled ? "Ativado" : "Desativado"}</Badge>
          </div>
          {enabled ? (
            <Button variant="destructive" onClick={() => setDisableOpen(true)}>
              Desativar 2FA
            </Button>
          ) : (
            <Button onClick={startSetup}>Ativar 2FA</Button>
          )}
        </div>
      </CardContent>

      <Modal
        open={setupOpen}
        onOpenChange={(open) => {
          setSetupOpen(open);
          if (!open) {
            setQrCodeDataUrl(null);
            setSecret(null);
            setCode("");
            setSetupError(null);
          }
        }}
        title="Ativar verificação em duas etapas"
        description="Escaneie o QR code com seu app autenticador (Google Authenticator, Authy, etc.) e digite o código gerado."
        footer={
          <Button onClick={confirmSetup} loading={setupLoading} disabled={!qrCodeDataUrl || code.length !== 6}>
            Confirmar e ativar
          </Button>
        }
      >
        {setupLoading && !qrCodeDataUrl && <p className="text-sm text-zinc-500">Gerando QR code...</p>}
        {qrCodeDataUrl && (
          <div className="flex flex-col items-center gap-4">
            <Image src={qrCodeDataUrl} alt="QR code para configurar o 2FA" width={200} height={200} unoptimized />
            {secret && (
              <p className="text-center text-xs text-zinc-500">
                Ou digite manualmente: <span className="font-mono">{secret}</span>
              </p>
            )}
            <div className="w-full">
              <Input
                label="Código de 6 dígitos"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          </div>
        )}
        {setupError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {setupError}
          </p>
        )}
      </Modal>

      <Modal
        open={disableOpen}
        onOpenChange={(open) => {
          setDisableOpen(open);
          if (!open) {
            setDisablePassword("");
            setDisableError(null);
          }
        }}
        title="Desativar verificação em duas etapas"
        description="Confirme sua senha atual para desativar o 2FA."
        footer={
          <Button variant="destructive" onClick={confirmDisable} loading={disableLoading}>
            Desativar
          </Button>
        }
      >
        <PasswordInput
          label="Senha atual"
          value={disablePassword}
          onChange={(e) => setDisablePassword(e.target.value)}
        />
        {disableError && (
          <p role="alert" className="mt-2 text-sm text-red-600">
            {disableError}
          </p>
        )}
      </Modal>
    </Card>
  );
}
