import { notFound } from "next/navigation";

/**
 * Tela só de desenvolvimento/preview. O `import()` fica dentro do `if` com a
 * chave de build (`next.config.ts` → `NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED`) para
 * o bundler descartar o ramo — e os dados de exemplo — no build de produção.
 */
export default async function PipelineFiltersShowcaseRoute() {
  if (process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true") {
    const { default: ClientPage } = await import("./client-page");
    return <ClientPage />;
  }
  notFound();
}
