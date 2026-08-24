import type { Metadata } from "next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { ToastProvider } from "@/components/ui/Toast";
import "./globals.css";

// App inteiro é pessoal e autenticado (saudação por usuário, sessão via cookie);
// não há nada a pré-renderizar estaticamente em build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Wordbee — Automação de Artigos para WordPress",
  description: "Gere e publique artigos no WordPress automaticamente com IA.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
