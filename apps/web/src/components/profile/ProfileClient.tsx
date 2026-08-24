"use client";

import { NameSection } from "@/components/profile/NameSection";
import { PasswordSection } from "@/components/profile/PasswordSection";
import { TwoFactorSection } from "@/components/profile/TwoFactorSection";
import { SessionsSection } from "@/components/profile/SessionsSection";

export function ProfileClient({
  initialUser,
}: {
  initialUser: { nome: string; email: string; totpEnabled: boolean };
}) {
  return (
    <div className="flex flex-col gap-6">
      <NameSection initialNome={initialUser.nome} />
      <PasswordSection />
      <TwoFactorSection initialEnabled={initialUser.totpEnabled} />
      <SessionsSection />
    </div>
  );
}
