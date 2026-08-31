"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { GRUPO_STATUS_LABEL, type GrupoParceiroSummary, type GrupoParceiroStatusValue } from "@/lib/distribution-types";

/** "1.234,56" ou "1234.56" → 123456 centavos. */
function paraCentavos(valor: string): number {
  const limpo = valor.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const numero = Number.parseFloat(limpo);
  if (!Number.isFinite(numero) || numero < 0) return 0;
  return Math.round(numero * 100);
}

function deCentavos(centavos: number): string {
  return (centavos / 100).toFixed(2).replace(".", ",");
}

export function GrupoFormModal({
  open,
  onOpenChange,
  grupo,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  grupo: GrupoParceiroSummary | null;
  onSaved: (grupo: GrupoParceiroSummary) => void;
}) {
  const { toast } = useToast();
  const isEdit = !!grupo;
  const [nome, setNome] = useState("");
  const [link, setLink] = useState("");
  const [adminContato, setAdminContato] = useState("");
  const [valor, setValor] = useState("0,00");
  const [periodoInicio, setPeriodoInicio] = useState("");
  const [periodoFim, setPeriodoFim] = useState("");
  const [membrosAprox, setMembrosAprox] = useState("");
  const [confirma, setConfirma] = useState(false);
  const [status, setStatus] = useState<GrupoParceiroStatusValue>("ATIVO");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNome(grupo?.nome ?? "");
    setLink(grupo?.link ?? "");
    setAdminContato(grupo?.adminContato ?? "");
    setValor(deCentavos(grupo?.valorPagoCentavos ?? 0));
    setPeriodoInicio(grupo?.periodoInicio ?? new Date().toISOString().slice(0, 10));
    setPeriodoFim(grupo?.periodoFim ?? "");
    setMembrosAprox(grupo?.membrosAprox != null ? String(grupo.membrosAprox) : "");
    setConfirma(grupo?.confirmaDivulgacaoParceria ?? false);
    setStatus(grupo?.status ?? "ATIVO");
    setErro(null);
  }, [open, grupo]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const body = {
        nome,
        link,
        adminContato: adminContato || undefined,
        valorPagoCentavos: paraCentavos(valor),
        periodoInicio,
        periodoFim: periodoFim || null,
        membrosAprox: membrosAprox ? Number.parseInt(membrosAprox, 10) : null,
        confirmaDivulgacaoParceria: confirma,
        status,
      };
      const res = await fetch(isEdit ? `/api/grupos-parceiros/${grupo!.id}` : "/api/grupos-parceiros", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível salvar o grupo.");
      onSaved(data.grupo);
      onOpenChange(false);
      toast({ title: isEdit ? "Grupo atualizado." : "Grupo cadastrado.", variant: "success" });
    } catch (err) {
      const message = (err as Error).message;
      setErro(message);
      toast({ title: "Não foi possível salvar.", description: message, variant: "error" });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Editar grupo parceiro" : "Novo grupo parceiro"}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="grupo-form" loading={salvando}>
            {isEdit ? "Salvar" : "Cadastrar"}
          </Button>
        </>
      }
    >
      <form id="grupo-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input label="Nome do grupo" value={nome} onChange={(e) => setNome(e.target.value)} required />
        <Input
          label="Link do grupo"
          type="url"
          placeholder="https://facebook.com/groups/..."
          value={link}
          onChange={(e) => setLink(e.target.value)}
          required
        />
        <Input
          label="Administrador / contato (opcional)"
          hint="Com quem você fechou a parceria."
          value={adminContato}
          onChange={(e) => setAdminContato(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Valor da parceria (R$/mês)"
            hint="Use 0 para parceria sem pagamento."
            inputMode="decimal"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
          <Input
            label="Membros (aprox.)"
            hint="Informativo, ajuda a priorizar."
            inputMode="numeric"
            value={membrosAprox}
            onChange={(e) => setMembrosAprox(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Início da parceria"
            type="date"
            value={periodoInicio}
            onChange={(e) => setPeriodoInicio(e.target.value)}
            required
          />
          <Input
            label="Fim (opcional)"
            type="date"
            value={periodoFim}
            onChange={(e) => setPeriodoFim(e.target.value)}
          />
        </div>

        <Select
          label="Status da parceria"
          hint="Só grupos ATIVOS podem receber novas postagens na fila."
          value={status}
          onChange={(e) => setStatus(e.target.value as GrupoParceiroStatusValue)}
        >
          {(Object.keys(GRUPO_STATUS_LABEL) as GrupoParceiroStatusValue[]).map((s) => (
            <option key={s} value={s}>
              {GRUPO_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>

        <label className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 dark:border-graphite-700/60">
          <Switch checked={confirma} onCheckedChange={setConfirma} aria-label="Confirma divulgação da parceria" />
          <span className="text-sm text-zinc-600 dark:text-zinc-300">
            O dono do grupo <strong>avisa aos membros</strong> que existe uma parceria/publicidade.
            <span className="mt-1 block text-xs text-zinc-500 dark:text-zinc-400">
              É essa transparência que separa publicidade legítima de publicidade velada. O grupo funciona sem marcar,
              mas o aviso fica visível no card até você confirmar.
            </span>
          </span>
        </label>

        {erro && (
          <p role="alert" className="text-sm text-red-600">
            {erro}
          </p>
        )}
      </form>
    </Modal>
  );
}
