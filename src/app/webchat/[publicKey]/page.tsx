import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WebchatRoot } from "@/features/webchat-widget/webchat-root";
import { isWebchatPublicKey } from "@/lib/webchat-origin";

/**
 * Widget do Webchat — iframe injetado por `public/webchat/embed.js` no site
 * do cliente (`?host=<origem do site>`) e, aberta direto, página hospedada da
 * org. Pública (middleware libera `/webchat/`), sem layout do CRM.
 *
 * O header `Content-Security-Policy: frame-ancestors` desta rota é montado no
 * middleware a partir de `allowedOrigins` do canal.
 */
export const metadata: Metadata = {
  title: "Chat",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ publicKey: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(v: string | string[] | undefined): string | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export default async function WebchatPage({ params, searchParams }: Props) {
  const { publicKey } = await params;
  if (!isWebchatPublicKey(publicKey)) notFound();
  const sp = await searchParams;
  return (
    <WebchatRoot
      publicKey={publicKey}
      host={first(sp.host)}
      preview={first(sp.preview) === "1"}
    />
  );
}
