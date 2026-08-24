import { Globe } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

export default function SitesWordpressPage() {
  return (
    <div>
      <PageHeader
        title="Sites WordPress"
        subtitle="Gerencie os blogs onde seus artigos serão publicados."
        action={<Button disabled>+ Novo site</Button>}
      />
      <Card>
        <CardContent>
          <EmptyState
            icon={Globe}
            title="Nenhum site cadastrado"
            description="Adicione seu primeiro site WordPress para começar."
            action={<Button disabled>Cadastrar site</Button>}
          />
        </CardContent>
      </Card>
    </div>
  );
}
