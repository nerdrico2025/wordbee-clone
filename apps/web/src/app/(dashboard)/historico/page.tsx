import { History } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export default function HistoricoPage() {
  return (
    <div>
      <PageHeader title="Histórico" subtitle="Todos os artigos gerados, manuais ou por linhas de produção." />
      <Card>
        <CardContent>
          <EmptyState
            icon={History}
            title="Nenhum artigo no histórico"
            description="Os artigos gerados manualmente ou por linhas de produção vão aparecer aqui."
          />
        </CardContent>
      </Card>
    </div>
  );
}
