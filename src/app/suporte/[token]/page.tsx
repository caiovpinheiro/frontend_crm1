import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RemoteSupportClientPage } from "@/features/remote-support/client-page";

/**
 * Página que o CLIENTE abre (link do card "Suporte remoto"). Pública
 * (middleware libera `/suporte/`), sem layout do CRM. No Windows baixa o
 * Assistant já configurado; em outro sistema explica onde abrir o link.
 */
export const metadata: Metadata = {
  title: "Suporte remoto",
  robots: { index: false, follow: false },
};

const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export default async function SuportePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) notFound();
  return <RemoteSupportClientPage token={token} />;
}
