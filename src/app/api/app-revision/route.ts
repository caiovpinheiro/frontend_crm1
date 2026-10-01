/**
 * GET /api/app-revision
 *
 * Fingerprint do build atual servido pelo servidor Next.js — usado pelo
 * `MobileAppUpdateDialog` para detectar deploys novos. Diferente de
 * `/changelog.json` (estático, cacheável pelo SW), `/api/*` é excluído do
 * precache do Serwist (ver `next.config.ts`) e a rota abaixo força
 * `no-store` para garantir que o WebView do APK sempre veja o valor real
 * do servidor, nunca uma resposta cacheada.
 *
 * Rota PÚBLICA: devolve só o identificador opaco do build (hash curto,
 * calculado em `scripts/generate-app-revision.mjs`) — nunca o SHA do commit
 * nem a hora do build. O cliente só compara "igual ou diferente" com o
 * `NEXT_PUBLIC_BUILD_ID` embutido no bundle.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export function GET() {
  return Response.json(
    { revision: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" },
    { headers: { "Cache-Control": "no-store, no-cache, must-revalidate" } },
  );
}
