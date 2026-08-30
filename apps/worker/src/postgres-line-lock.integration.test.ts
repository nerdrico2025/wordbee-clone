/**
 * Teste de integração com Postgres REAL (não mocka Prisma nem simula o
 * comportamento de `FOR UPDATE SKIP LOCKED`) — existe especificamente para
 * cobrir a classe de bug que um mock não pega: duas transações concorrentes
 * disputando a mesma linha. `claimDueLines` (postgres-line-lock.ts) é o
 * substituto do lock via Redis `SET NX` da arquitetura BullMQ antiga; a
 * garantia central ("nunca duas execuções simultâneas da mesma linha") só
 * pode ser provada de verdade contra um Postgres de verdade, com duas
 * conexões reais disparando ao mesmo tempo. Ver DECISIONS.md "scheduler
 * cron+Postgres".
 *
 * Sobe um cluster Postgres efêmero em processo filho via `initdb`/`pg_ctl`
 * (localhost, porta livre, sem persistência, socket em /tmp por causa do
 * limite de tamanho de path de socket Unix) — mesmo espírito do
 * `redis-server` efêmero usado em
 * `production-line-worker.integration.test.ts` (histórico, já removido
 * junto com o BullMQ) e em `retire-bullmq-line-queue.test.mjs`. Se os
 * binários do Postgres não estiverem disponíveis no ambiente, o teste é
 * pulado. As migrações reais do projeto (`prisma migrate deploy`) são
 * aplicadas nesse banco efêmero — isso também serve como teste de que a
 * migração `20260830120000_add_production_line_lock_columns` roda sem erro.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execFileSync, execSync } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function hasPostgresBinaries(): boolean {
  try {
    execSync("which initdb && which pg_ctl", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const PG_AVAILABLE = hasPostgresBinaries();

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.once("error", reject);
    srv.listen(0, () => {
      const address = srv.address();
      if (address && typeof address === "object") {
        const port = address.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error("não foi possível obter uma porta livre")));
      }
    });
  });
}

const REPO_ROOT = path.resolve(__dirname, "../../..");

describe.skipIf(!PG_AVAILABLE)("postgres-line-lock — claim atômico e liberação (Postgres real)", () => {
  let dataDir: string;
  let port: number;
  let connectionString: string;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "wordbee-pgtest-"));
    execFileSync("initdb", ["-D", dataDir, "-U", "testuser", "--auth=trust", "-E", "UTF8"], { stdio: "ignore" });

    port = await findFreePort();
    execFileSync("pg_ctl", [
      "-D", dataDir,
      "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c unix_socket_directories=/tmp`,
      "-l", path.join(dataDir, "log.txt"),
      "-w",
      "start",
    ]);

    connectionString = `postgresql://testuser@127.0.0.1:${port}/postgres`;

    execFileSync(path.join(REPO_ROOT, "node_modules/.bin/prisma"), [
      "migrate", "deploy",
      "--schema", path.join(REPO_ROOT, "packages/db/prisma/schema.prisma"),
    ], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL: connectionString },
      stdio: "pipe",
    });

    // Precisa ser setado ANTES do primeiro import de "@wordbee/db" — o
    // singleton `prisma` exportado por lá lê DATABASE_URL na construção do
    // PrismaClient, que acontece na carga do módulo.
    process.env.DATABASE_URL = connectionString;
  }, 60_000);

  afterAll(async () => {
    const { prisma } = await import("@wordbee/db");
    await prisma.$disconnect();
    execFileSync("pg_ctl", ["-D", dataDir, "stop", "-m", "fast"]);
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  let userId: string;
  let wpSiteId: string;

  beforeEach(async () => {
    const { prisma } = await import("@wordbee/db");
    // Isolamento simples entre testes: cada teste começa com as tabelas
    // relevantes vazias (CASCADE cobre production_lines/articles/etc via FK).
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "users" CASCADE');

    const user = await prisma.user.create({
      data: { nome: "Usuário Teste", email: `teste-${Date.now()}-${Math.random()}@example.com`, senhaHash: "x" },
    });
    const wpSite = await prisma.wpSite.create({
      data: { userId: user.id, nome: "Site Teste", url: "https://blog.test", usuario: "admin", appPasswordEncrypted: "x", iv: "x", authTag: "x" },
    });
    userId = user.id;
    wpSiteId = wpSite.id;
  });

  async function createLine(overrides: Partial<{
    status: "ATIVA" | "PAUSADA" | "CONCLUIDA";
    nextRunAt: Date | null;
    lockedAt: Date | null;
    lockedBy: string | null;
  }> = {}) {
    const { prisma } = await import("@wordbee/db");
    return prisma.productionLine.create({
      data: {
        userId,
        wpSiteId,
        nome: "Linha de teste",
        iaTexto: "GEMINI",
        iaImagem: "GEMINI",
        tipoArtigo: "TUTORIAL",
        temas: ["Tema A"],
        intervaloMin: 10,
        status: overrides.status ?? "ATIVA",
        nextRunAt: overrides.nextRunAt === undefined ? new Date(Date.now() - 60_000) : overrides.nextRunAt,
        lockedAt: overrides.lockedAt ?? null,
        lockedBy: overrides.lockedBy ?? null,
      },
    });
  }

  it("duas reivindicações concorrentes na mesma linha: só uma pega (SKIP LOCKED real)", async () => {
    const { claimDueLines } = await import("./postgres-line-lock.js");
    const line = await createLine();

    const [resultA, resultB] = await Promise.all([
      claimDueLines("worker-a", 5),
      claimDueLines("worker-b", 5),
    ]);

    const claimedByA = resultA.some((l) => l.id === line.id);
    const claimedByB = resultB.some((l) => l.id === line.id);

    // Exatamente uma das duas reivindicações concorrentes pegou a linha —
    // nunca as duas, nunca nenhuma.
    expect(claimedByA !== claimedByB).toBe(true);

    const { prisma } = await import("@wordbee/db");
    const persisted = await prisma.productionLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(persisted.lockedAt).not.toBeNull();
    expect(persisted.lockedBy).toBe(claimedByA ? "worker-a" : "worker-b");
  });

  it("não reivindica uma linha com nextRunAt no futuro", async () => {
    const { claimDueLines } = await import("./postgres-line-lock.js");
    await createLine({ nextRunAt: new Date(Date.now() + 60 * 60_000) });

    const result = await claimDueLines("worker-a", 5);
    expect(result).toHaveLength(0);
  });

  it("não reivindica uma linha PAUSADA ou CONCLUIDA mesmo com nextRunAt vencido", async () => {
    const { claimDueLines } = await import("./postgres-line-lock.js");
    await createLine({ status: "PAUSADA" });
    await createLine({ status: "CONCLUIDA" });

    const result = await claimDueLines("worker-a", 5);
    expect(result).toHaveLength(0);
  });

  it("não reivindica uma linha com lock recente (execução real em andamento em outro worker)", async () => {
    const { claimDueLines } = await import("./postgres-line-lock.js");
    await createLine({ lockedAt: new Date(Date.now() - 30_000), lockedBy: "outro-worker" });

    const result = await claimDueLines("worker-a", 5);
    expect(result).toHaveLength(0);
  });

  it("reivindica de novo uma linha cujo lock está velho (worker anterior travou/morreu no meio da execução)", async () => {
    const { claimDueLines } = await import("./postgres-line-lock.js");
    const staleLockedAt = new Date(Date.now() - 25 * 60_000); // acima do padrão de 20 min
    const line = await createLine({ lockedAt: staleLockedAt, lockedBy: "worker-morto" });

    const result = await claimDueLines("worker-novo", 5);
    expect(result.map((l) => l.id)).toEqual([line.id]);
  });

  it("respeita o limite e a ordem por nextRunAt (mais antiga primeiro)", async () => {
    const { claimDueLines } = await import("./postgres-line-lock.js");
    const older = await createLine({ nextRunAt: new Date(Date.now() - 5 * 60_000) });
    const newer = await createLine({ nextRunAt: new Date(Date.now() - 60_000) });

    const result = await claimDueLines("worker-a", 1);
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe(older.id);
    expect(result.map((l) => l.id)).not.toContain(newer.id);
  });

  it("releaseLine libera o lock, permitindo nova reivindicação", async () => {
    const { claimDueLines, releaseLine } = await import("./postgres-line-lock.js");
    const line = await createLine();

    const [firstClaim] = await claimDueLines("worker-a", 5);
    expect(firstClaim?.id).toBe(line.id);

    // Enquanto o lock está ativo (fresco), ninguém mais reivindica.
    expect(await claimDueLines("worker-b", 5)).toHaveLength(0);

    await releaseLine(line.id);

    const [secondClaim] = await claimDueLines("worker-b", 5);
    expect(secondClaim?.id).toBe(line.id);
  });

  it("releaseLine não lança se a linha já foi deletada (corrida com exclusão pelo usuário)", async () => {
    const { releaseLine } = await import("./postgres-line-lock.js");
    await expect(releaseLine("linha-inexistente")).resolves.toBeUndefined();
  });
});
