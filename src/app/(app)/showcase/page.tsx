import type { Metadata } from "next"
import { notFound } from "next/navigation"

export const metadata: Metadata = {
  title: "Design System v2 — Showcase",
  description: "Referência visual de todos os componentes e tokens do DS v2.",
}

/**
 * Tela só de desenvolvimento/preview. O `import()` fica dentro do `if` com a
 * chave de build (`next.config.ts` → `NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED`) para
 * o bundler descartar o ramo — e os dados de exemplo — no build de produção.
 */
export default async function ShowcasePage() {
  if (process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true") {
    const { ShowcaseClient } = await import("./showcase-client")
    return <ShowcaseClient />
  }
  notFound()
}
