/**
 * Manifesto de versão do APK.
 *
 * Produção: mesmo host do CRM (`https://bwipo.com/mobile-release.json`).
 * Override: NEXT_PUBLIC_MOBILE_RELEASE_MANIFEST_URL
 */
export const DEFAULT_MOBILE_RELEASE_MANIFEST_URL =
  "https://bwipo.com/mobile-release.json";

export function resolveMobileReleaseManifestUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_MOBILE_RELEASE_MANIFEST_URL?.trim()
      : undefined;
  if (fromEnv) return fromEnv;
  return DEFAULT_MOBILE_RELEASE_MANIFEST_URL;
}
