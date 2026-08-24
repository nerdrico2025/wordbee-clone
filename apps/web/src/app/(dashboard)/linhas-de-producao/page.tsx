import { Workflow } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function LinhasDeProducaoPage() {
  return (
    <div>
      <PageHeader
        title="Linhas de Produção"
        subtitle="Crie artigos automaticamente no piloto automático."
        action={<Button disabled>+ Nova Linha</Button>}
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={Workflow}
            title="Nenhuma linha de produção"
            description="Crie sua primeira linha para gerar artigos automaticamente."
            action={<Button disabled>Criar Primeira Linha</Button>}
          />
        </CardContent>
      </Card>
    </div>
  );
}
