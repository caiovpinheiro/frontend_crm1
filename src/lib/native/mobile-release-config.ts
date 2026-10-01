/**
 * Manifesto de versão do APK (serviço EasyPanel separado do CRM).
 *
 * Override de build: NEXT_PUBLIC_MOBILE_RELEASE_MANIFEST_URL
 */
export const PROD_MOBILE_RELEASE_MANIFEST_URL =
  "https://crm-mobile.7w7dai.easypanel.host/mobile-release.json";

export const DEV_MOBILE_RELEASE_MANIFEST_URL =
  "https://crm-apk-dev.ca31ey.easypanel.host/mobile-release.json";

/** @deprecated use PROD_MOBILE_RELEASE_MANIFEST_URL */
export const DEFAULT_MOBILE_RELEASE_MANIFEST_URL = PROD_MOBILE_RELEASE_MANIFEST_URL;

function isDevHost(value: string): boolean {
  const host = value.toLowerCase();
  return (
    host.includes("crm-dev-frontend") ||
    host.includes("crm-apk-dev") ||
    host.includes("ca31ey.easypanel.host")
  );
}

export function resolveMobileReleaseManifestUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_MOBILE_RELEASE_MANIFEST_URL?.trim()
      : undefined;
  if (fromEnv) return fromEnv;

  if (typeof window !== "undefined" && isDevHost(window.location.hostname)) {
    return DEV_MOBILE_RELEASE_MANIFEST_URL;
  }

  const appUrl =
    typeof process !== "undefined" ? (process.env.NEXT_PUBLIC_APP_URL ?? "") : "";
  if (isDevHost(appUrl)) return DEV_MOBILE_RELEASE_MANIFEST_URL;

  return PROD_MOBILE_RELEASE_MANIFEST_URL;
}

/**
 * Base PÚBLICA dos downloads do app (onde o APK é servido para o usuário).
 *
 * O manifesto traz `apkUrl` apontando para o host do serviço de releases
 * (hoje um host interno do EasyPanel), e `/api/mobile-release` repassava isso
 * a qualquer visitante (pentest). Com esta env definida, o `apkUrl` entregue
 * ao cliente troca a origem pela base pública, mantendo o caminho do arquivo.
 *
 *  - `MOBILE_RELEASE_PUBLIC_BASE_URL` — servidor, lida em runtime (proxy);
 *  - `NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL` — build; vale também no
 *    cliente, quando o app lê o manifesto direto do serviço de releases.
 *
 * Sem nenhuma das duas (default) devolve `null` e o `apkUrl` segue como veio
 * do manifesto — comportamento de sempre, para não quebrar o app mobile.
 */
export function resolveMobileReleasePublicBaseUrl(): string | null {
  if (typeof process === "undefined") return null;
  const raw = (
    process.env.MOBILE_RELEASE_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_MOBILE_RELEASE_PUBLIC_BASE_URL ||
    ""
  ).trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * `apkUrl` do manifesto reescrito para a base pública (mesmo caminho e query).
 * Sem base configurada, ou com `apkUrl` que não é URL absoluta, devolve o
 * valor original.
 */
export function publicApkUrl(
  apkUrl: string,
  publicBase: string | null = resolveMobileReleasePublicBaseUrl(),
): string {
  if (!publicBase) return apkUrl;
  try {
    const original = new URL(apkUrl);
    return `${publicBase}${original.pathname}${original.search}`;
  } catch {
    return apkUrl;
  }
}

/** Manifesto como vai para o cliente: igual ao original, com `apkUrl` público. */
export function publicMobileReleaseManifest(
  data: unknown,
  publicBase: string | null = resolveMobileReleasePublicBaseUrl(),
): unknown {
  if (!publicBase || !data || typeof data !== "object" || Array.isArray(data)) return data;
  const manifest = data as Record<string, unknown>;
  if (typeof manifest.apkUrl !== "string") return data;
  return { ...manifest, apkUrl: publicApkUrl(manifest.apkUrl.trim(), publicBase) };
}
