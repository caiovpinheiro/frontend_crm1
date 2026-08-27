/**
 * Manifesto de versão do APK (serviço EasyPanel separado).
 *
 * Host real do serviço de releases (EasyPanel → Domínios).
 * Override: NEXT_PUBLIC_MOBILE_RELEASE_MANIFEST_URL
 */
export const DEFAULT_MOBILE_RELEASE_MANIFEST_URL =
  "https://frontend-app.v74knz.easypanel.host/mobile-release.json";

export function resolveMobileReleaseManifestUrl(): string {
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_MOBILE_RELEASE_MANIFEST_URL?.trim()
      : undefined;
  if (fromEnv) return fromEnv;
  return DEFAULT_MOBILE_RELEASE_MANIFEST_URL;
}
