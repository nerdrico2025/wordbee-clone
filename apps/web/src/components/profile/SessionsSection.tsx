"use client";

import { useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";

interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

export function SessionsSection() {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/profile/sessions");
    const data = await res.json();
    if (res.ok) setSessions(data.sessions);
  }

  useEffect(() => {
    load();
  }, []);

  async function revoke(id: string) {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/profile/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Sessão encerrada.", variant: "success" });
      if (sessions?.find((s) => s.id === id)?.current) {
        window.location.href = "/login";
        return;
      }
      await load();
    } catch {
      toast({ title: "Não foi possível encerrar a sessão.", variant: "error" });
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sessões ativas</CardTitle>
        <CardDescription>Dispositivos onde sua conta está conectada no momento.</CardDescription>
      </CardHeader>
      <CardContent>
        {sessions === null && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        )}

        {sessions?.length === 0 && <p className="text-sm text-zinc-500">Nenhuma sessão ativa encontrada.</p>}

        <ul className="flex flex-col divide-y divide-zinc-100 dark:divide-graphite-700/60">
          {sessions?.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-4 py-3">
              <div className="flex items-center gap-3">
                <Monitor className="h-4 w-4 shrink-0 text-zinc-400" />
                <div>
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">
                    {s.userAgent ?? "Dispositivo desconhecido"} {s.current && <Badge variant="purple">Sessão atual</Badge>}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {s.ip ?? "IP desconhecido"} · última atividade em{" "}
                    {new Date(s.lastSeenAt).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
              <Button
                variant="secondary"
                size="sm"
                loading={revokingId === s.id}
                onClick={() => revoke(s.id)}
              >
                Encerrar
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
