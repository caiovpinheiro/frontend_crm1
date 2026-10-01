import { notFound } from "next/navigation";

/**
 * Showcase dev-only dos primitivos de permissão (Fase 1). Substitui o
 * Storybook: lista todos os componentes em seus estados
 * (default / disabled / sensível / herdado / loading / empty).
 * Bloqueado em produção — e fora do bundle: o `import()` fica dentro do `if`
 * com a chave de build (`next.config.ts` → `NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED`).
 */
export default async function DsPermissionsShowcasePage() {
  if (process.env.NEXT_PUBLIC_PREVIEW_MOCKS_BUNDLED === "true") {
    const { default: ShowcaseClient } = await import("./showcase-client");
    return <ShowcaseClient />;
  }
  notFound();
}
