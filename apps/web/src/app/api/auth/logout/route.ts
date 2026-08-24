import { NextResponse } from "next/server";
import { getCurrentSession, revokeSession, clearSessionCookie } from "@/lib/auth";

export async function POST() {
  const session = await getCurrentSession();
  if (session) {
    await revokeSession(session.sessionId);
  }
  clearSessionCookie();
  return NextResponse.json({ ok: true });
}
