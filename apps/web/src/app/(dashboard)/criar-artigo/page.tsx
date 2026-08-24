import { redirect } from "next/navigation";
import { Globe, KeyRound } from "lucide-react";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";
import { listConfiguredProviders } from "@/lib/api-keys";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { CriarArtigoForm } from "@/components/criar-artigo/CriarArtigoForm";
import Link from "next/link";

export default async function CriarArtigoPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const [sites, textProviders, imageProviders] = await Promise.all([
    prisma.wpSite.findMany({ where: { userId: session.user.id }, orderBy: { nome: "asc" }, select: { id: true, nome: true } }),
    listConfiguredProviders(session.user.id, "TEXTO"),
    listConfiguredProviders(session.user.id, "IMAGEM"),
  ]);

  const subtitle = "Gere e publique um artigo agora mesmo, do título à imagem destacada.";

  if (sites.length === 0) {
    return (
      <div>
        <PageHeader title="Criar Artigo" subtitle={subtitle} />
        <Card>
          <CardContent>
            <EmptyState
              icon={Globe}
              title="Nenhum site cadastrado"
              description="Cadastre um site WordPress antes de gerar artigos."
              action={
                <Link href="/sites-wordpress">
                  <Button>Cadastrar site</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (textProviders.length === 0 || imageProviders.length === 0) {
    return (
      <div>
        <PageHeader title="Criar Artigo" subtitle={subtitle} />
        <Card>
          <CardContent>
            <EmptyState
              icon={KeyRound}
              title="Configure uma chave de IA"
              description="Você precisa de pelo menos uma chave de IA de texto e uma de imagem para gerar artigos."
              action={
                <Link href="/chaves-de-api">
                  <Button>Configurar IAs</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Criar Artigo" subtitle={subtitle} />
      <CriarArtigoForm sites={sites} textProviders={textProviders} imageProviders={imageProviders} />
    </div>
  );
}
