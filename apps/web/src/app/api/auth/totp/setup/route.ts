import { NextResponse } from "next/server";
import { prisma } from "@wordbee/db";
import { generateTotpSecret, generateTotpQrCodeDataUrl } from "@wordbee/shared";
import { getCurrentSession } from "@/lib/auth";

export async function POST() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: session.user.id }, data: { totpSecret: secret, totpEnabled: false } });

  const qrCodeDataUrl = await generateTotpQrCodeDataUrl(secret, session.user.email);

  return NextResponse.json({ secret, qrCodeDataUrl });
}
