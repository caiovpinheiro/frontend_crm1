/**
 * Arquivos de `public/` que o service worker (Serwist) pré-carrega.
 *
 * O padrão do `@serwist/next` é `["**\/*"]`, e os arquivos de `public/`
 * entram como `additionalPrecacheEntries` — sem o limite de tamanho do
 * precache. Resultado: todo navegador que instalava o SW baixava o vídeo do
 * tutorial (34 MB) e os 4 APKs (18 MB) do container do frontend (F4, 05/10).
 * `tutorials/` e `releases/` ficam fora: são baixados só sob demanda (e com
 * cache longo, `next.config.ts`).
 */
export const SW_PUBLIC_PRECACHE_PATTERNS = ["*", "!(tutorials|releases)/**/*"];
