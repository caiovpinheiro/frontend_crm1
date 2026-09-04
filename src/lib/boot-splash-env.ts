/**
 * When to skip the full-page BootSplash (BLoader).
 *
 * EasyPanel DEV deploys a production Next build (`NODE_ENV=production`), so
 * `NODE_ENV === "development"` alone is not enough. Prefer a build-time public
 * flag so the root layout never adds `bl-booting` (no first-paint flash).
 *
 * EasyPanel DEV: set `NEXT_PUBLIC_SKIP_BOOT_SPLASH=1` or
 * `NEXT_PUBLIC_APP_ENV=development` (rebuild required). Hostname checks are a
 * client fallback for `crm-dev-*` hosts when env is not set yet.
 */

const DEV_APP_ENVS = new Set(["dev", "development", "staging"]);

function truthyFlag(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Build-time / server-safe: local next dev + explicit public env flags. */
export function shouldSkipBootSplashFromEnv(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (truthyFlag(process.env.NEXT_PUBLIC_SKIP_BOOT_SPLASH)) return true;
  const appEnv = (process.env.NEXT_PUBLIC_APP_ENV ?? "").trim().toLowerCase();
  if (appEnv && DEV_APP_ENVS.has(appEnv)) return true;
  return false;
}

/**
 * Client-only host fallback (EasyPanel DEV URL without waiting for env).
 * Never matches production `bwipo.com` / non-dev EasyPanel hosts.
 */
export function isDevDeployHostname(hostname: string): boolean {
  const h = hostname.trim().toLowerCase();
  if (!h) return false;
  if (h.includes("crm-dev")) return true;
  // e.g. something-dev.….easypanel.host — require both "dev" and easypanel
  if (h.endsWith(".easypanel.host")) {
    const sub = h.slice(0, -".easypanel.host".length);
    if (sub.includes("dev")) return true;
  }
  return false;
}

/** Full gate for client BootSplash (env + hostname). */
export function shouldSkipBootSplashClient(): boolean {
  if (shouldSkipBootSplashFromEnv()) return true;
  if (typeof window === "undefined") return false;
  return isDevDeployHostname(window.location.hostname);
}
