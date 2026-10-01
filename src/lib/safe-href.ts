const BLOCKED_SCHEME = /^(javascript|data|vbscript|blob|file):/i;
const SAFE_HREF_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/**
 * Links de editor (TipTap Keep / e-mail). TipTap 3.26 já recusa `javascript:`
 * em setLink/parseHTML/renderHTML; este helper é o allowlist explícito usado
 * nos prompts e no `isAllowedUri` configurado.
 */
export function isSafeHref(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim();
  if (!value) return false;
  if (BLOCKED_SCHEME.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (value.startsWith("#")) return true;
  try {
    const parsed = value.includes(":")
      ? new URL(value)
      : new URL(`https://${value}`);
    if (parsed.username || parsed.password) return false;
    return SAFE_HREF_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

const ACTIVE_LOGO_PATH = /\.(svgz?|html?|xhtml|xml|js|mjs)(?:$|[/?#])/i;

/** Colar URL de logo no onboarding — o PATCH valida de novo no backend. */
export function isSafeLogoUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const value = raw.trim();
  if (!value) return false;
  if (BLOCKED_SCHEME.test(value)) return false;
  if (value.startsWith("/api/storage/")) {
    return /\/branding\/[^/]+\.(?:jpe?g|png|webp|gif)(?:$|[?#])/i.test(value);
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") return false;
    if (parsed.username || parsed.password || !parsed.hostname) return false;
    if (ACTIVE_LOGO_PATH.test(parsed.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}
