"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Facebook } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FacebookPageCard } from "@/components/facebook-pages/FacebookPageCard";
import { FacebookPageFormModal } from "@/components/facebook-pages/FacebookPageFormModal";
import type { FacebookPageSummary, WpSiteOption } from "@/lib/facebook-pages-types";

export function FacebookPagesClient({
  initialPages,
  sites,
}: {
  initialPages: FacebookPageSummary[];
  sites: WpSiteOption[];
}) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<FacebookPageSummary | null>(null);

  function openCreate() {
    setEditingPage(null);
    setModalOpen(true);
  }

  function openEdit(page: FacebookPageSummary) {
    setEditingPage(page);
    setModalOpen(true);
  }

  function handleSaved(page: FacebookPageSummary) {
    setPages((prev) => {
      const exists = prev.some((p) => p.id === page.id);
      const next = exists ? prev.map((p) => (p.id === page.id ? page : p)) : [...prev, page];
      return next.sort((a, b) => a.nome.localeCompare(b.nome));
    });
    // Cadastrar/editar uma Página muda o Painel de Distribuição e o bloco
    // do Dashboard, que o Router Cache do Next pode ter guardado.
    router.refresh();
  }

  function handleDeleted(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  }

  return (
    <div>
      <PageHeader
        title="Páginas do Facebook"
        subtitle="Páginas onde o Wordbee publica seus artigos automaticamente, pela API oficial da Meta."
        action={<Button onClick={openCreate}>+ Nova Página</Button>}
      />

      <Card className="mb-6 border-primary-100 bg-primary-50/60 dark:border-primary-500/20 dark:bg-primary-500/5">
        <CardContent>
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">Só Páginas — grupos e perfis são trabalho manual</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            A publicação automática só existe para <strong>Páginas</strong>, com token de Página pela API oficial do Facebook.
            Grupos e perfis pessoais não têm API de publicação e nunca serão automatizados aqui — para eles, o Wordbee monta o
            pacote pronto (imagem, texto e comentário) e você publica com um clique seu.
          </p>
        </CardContent>
      </Card>

      {pages.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Facebook}
              title="Nenhuma Página cadastrada"
              description="Cadastre uma Página que você administra para o Wordbee publicar seus artigos nela automaticamente."
              action={<Button onClick={openCreate}>Cadastrar Página</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((page) => (
            <FacebookPageCard key={page.id} page={page} onEdit={() => openEdit(page)} onDeleted={handleDeleted} />
          ))}
        </div>
      )}

      <FacebookPageFormModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        page={editingPage}
        sites={sites}
        onSaved={handleSaved}
      />
    </div>
  );
}
