import { PrismaClient } from "@prisma/client";
import { hashPassword } from "@wordbee/shared";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const nome = process.env.ADMIN_NAME ?? "Admin";

  if (!email || !password) {
    throw new Error(
      "ADMIN_EMAIL e ADMIN_PASSWORD precisam estar definidos no .env antes de rodar o seed."
    );
  }
  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD precisa ter pelo menos 8 caracteres.");
  }

  const senhaHash = await hashPassword(password);

  const user = await prisma.user.upsert({
    where: { email },
    update: { nome, senhaHash },
    create: { email, nome, senhaHash },
  });

  console.log(`Usuário único pronto: ${user.email} (id: ${user.id})`);
}

main()
  .catch((error) => {
    console.error("Falha no seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
