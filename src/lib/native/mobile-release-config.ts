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
