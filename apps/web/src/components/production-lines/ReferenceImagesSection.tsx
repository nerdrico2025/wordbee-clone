"use client";

import { useState } from "react";
import { X, ImagePlus } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import type { ReferenceImageSummary } from "@/lib/production-line-types";

export function ReferenceImagesSection({
  lineId,
  images,
  onChange,
}: {
  lineId: string;
  images: ReferenceImageSummary[];
  onChange: (images: ReferenceImageSummary[]) => void;
}) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const remaining = 5 - images.length;
    const toUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const uploaded: ReferenceImageSummary[] = [];
      for (const file of toUpload) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/production-lines/${lineId}/reference-images`, { method: "POST", body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Falha ao enviar imagem.");
        uploaded.push(data.image);
      }
      onChange([...images, ...uploaded]);
    } catch (err) {
      toast({ title: "Erro ao enviar imagem.", description: (err as Error).message, variant: "error" });
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(imageId: string) {
    try {
      const res = await fetch(`/api/production-lines/${lineId}/reference-images/${imageId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      onChange(images.filter((i) => i.id !== imageId));
    } catch {
      toast({ title: "Não foi possível remover a imagem.", variant: "error" });
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imagens de Referência ({images.length}/5)</CardTitle>
        <CardDescription>A IA usa essas imagens como inspiração visual (funciona melhor com Gemini).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative h-20 w-20 overflow-hidden rounded-lg border border-zinc-200 dark:border-graphite-700/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.storageUrl} alt="Referência" className="h-full w-full object-cover" />
              <button
                onClick={() => handleDelete(img.id)}
                className="absolute right-0 top-0 rounded-bl bg-black/60 p-1 text-white hover:bg-black/80"
                aria-label="Remover imagem"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {images.length < 5 && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-400 hover:border-primary-400 hover:text-primary-500 dark:border-graphite-700/60">
              <ImagePlus className="h-5 w-5" />
              {uploading ? "Enviando..." : "Adicionar"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleFiles(e.target.files)}
              />
            </label>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
