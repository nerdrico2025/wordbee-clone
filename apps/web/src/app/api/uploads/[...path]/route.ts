import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getStorageDriver } from "@wordbee/shared";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export async function GET(_req: Request, { params }: { params: { path: string[] } }) {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const key = params.path.join("/");
  if (key.includes("..")) return NextResponse.json({ error: "Caminho inválido." }, { status: 400 });

  try {
    const driver = getStorageDriver();
    const buffer = await driver.read(key);
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado." }, { status: 404 });
  }
}
