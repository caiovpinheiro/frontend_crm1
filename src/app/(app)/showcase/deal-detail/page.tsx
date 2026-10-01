import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Detalhe do Negócio — 3 Variações | DS v2",
  description: "Três propostas de refatoração da tela de detalhe do negócio dentro do DS v2.",
}

/**
 * Tela só de desenvolvimento/preview. O `import()` fica dentro do `if` com a
 * chave de build (`next.config.ts` → `NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED`) para
 * o bundler descartar o ramo — e os dados de exemplo — no build de produção.
 */
export default async function DealDetailShowcasePage() {
  if (process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true") {
    const { DealDetailVariations } = await import("./deal-detail-variations")
    return <DealDetailVariations />
  }
  notFound()
}
