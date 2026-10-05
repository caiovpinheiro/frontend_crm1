/**
 * Base pública dos arquivos estáticos pesados (vídeo de tutorial etc.)
 * quando eles saem do container do frontend para o Spaces/CDN (F4, 05/10).
 *
 * `NEXT_PUBLIC_MEDIA_CDN_BASE_URL` (build): origem + prefixo opcional, ex.
 * `https://<bucket>.<região>.cdn.digitaloceanspaces.com` ou
 * `https://cdn.bwipo.com/static`. O arquivo fica no MESMO caminho que tem em
 * `public/` (ex.: `/tutorials/...`). Sem a variável (default) — ou com valor
 * inválido — tudo continua servido pelo próprio frontend.
 *
 * APKs usam a base que já existia para o app (`MOBILE_RELEASE_PUBLIC_BASE_URL`
 * / `NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL`, `native/mobile-release-config.ts`).
 */
export function resolveMediaCdnBaseUrl(
  raw: string | null | undefined = process.env.NEXT_PUBLIC_MEDIA_CDN_BASE_URL,
): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** URL pública de `localPath` (caminho em `public/`, com `/` inicial). */
export function mediaAssetUrl(
  localPath: string,
  base: string | null = resolveMediaCdnBaseUrl(),
): string {
  if (!base) return localPath;
  return `${base}${localPath.startsWith("/") ? "" : "/"}${localPath}`;
}
