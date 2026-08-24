import { NextResponse } from "next/server";
import { prisma } from "@wordbee/db";
import { getCurrentSession } from "@/lib/auth";

export async function GET() {
  const session = await getCurrentSession();
  if (!session) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, userAgent: true, ip: true, createdAt: true, lastSeenAt: true, expiresAt: true },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({ ...s, current: s.id === session.sessionId })),
  });
}
