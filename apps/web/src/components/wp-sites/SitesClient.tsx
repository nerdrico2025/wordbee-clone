"use client";

import { useMemo, useState } from "react";
import { Globe, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { SiteCard } from "@/components/wp-sites/SiteCard";
import { SiteFormModal } from "@/components/wp-sites/SiteFormModal";
import type { WpSiteSummary } from "@/lib/wp-sites-types";

export function SitesClient({ initialSites }: { initialSites: WpSiteSummary[] }) {
  const [sites, setSites] = useState(initialSites);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<WpSiteSummary | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return sites;
    const q = search.toLowerCase();
    return sites.filter((s) => s.nome.toLowerCase().includes(q));
  }, [sites, search]);

  function openCreate() {
    setEditingSite(null);
    setModalOpen(true);
  }

  function openEdit(site: WpSiteSummary) {
    setEditingSite(site);
    setModalOpen(true);
  }

  function handleSaved(site: WpSiteSummary) {
    setSites((prev) => {
      const exists = prev.some((s) => s.id === site.id);
      return exists ? prev.map((s) => (s.id === site.id ? site : s)) : [...prev, site].sort((a, b) => a.nome.localeCompare(b.nome));
    });
  }

  function handleDeleted(id: string) {
    setSites((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div>
      <PageHeader
        title="Sites WordPress"
        subtitle="Gerencie os blogs onde seus artigos serão publicados."
        action={<Button onClick={openCreate}>+ Novo site</Button>}
      />

      {sites.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              icon={Globe}
              title="Nenhum site cadastrado"
              description="Adicione seu primeiro site WordPress para começar."
              action={<Button onClick={openCreate}>Cadastrar site</Button>}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {sites.length > 6 && (
            <div className="mb-4 max-w-sm">
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Buscar sites por nome"
              />
            </div>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((site) => (
              <SiteCard key={site.id} site={site} onEdit={() => openEdit(site)} onDeleted={handleDeleted} />
            ))}
          </div>
          {filtered.length === 0 && (
            <p className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
              <Search className="h-4 w-4" /> Nenhum site encontrado para &quot;{search}&quot;.
            </p>
          )}
        </>
      )}

      <SiteFormModal open={modalOpen} onOpenChange={setModalOpen} site={editingSite} onSaved={handleSaved} />
    </div>
  );
}
