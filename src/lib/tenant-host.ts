/**
 * Resolve tenant a partir do Host (e override de dev).
 *
 * Produção: `{slug}.crm.eduit.com.br`
 * Apex / reservados: marketing (landing, login público)
 * Dev: `{slug}.localhost[:port]` ou header `x-tenant-slug`
 */

import { getTenantBaseDomain } from "@/lib/tenant-url";

export const TENANT_SLUG_HEADER = "x-tenant-slug";
export const TENANT_SLUG_COOKIE = "tenant-slug";
/** Cache de existência ACTIVE (setado pelo middleware após by-slug). */
export const TENANT_VERIFIED_COOKIE = "tenant-slug-ok";

/** Labels reservados — não são orgs; comportamento de apex/marketing. */
export const RESERVED_TENANT_SLUGS = new Set([
  "www",
  "app",
  "api",
  "crm",
  "admin",
  "static",
  "assets",
  "mail",
  "status",
  "localhost",
]);

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;

/**
 * CRM num único origin (EasyPanel / localhost) — sem wildcard `{slug}.base`.
 * Nesses hosts o login é e-mail+senha no mesmo endereço; não redirecionar
 * para `{slug}.bwipo.com` (produção).
 */
export function isSingleHostCrm(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  if (!host) return false;
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return true;
  }
  if (host.endsWith(".localhost")) return true;
  return host === "easypanel.host" || host.endsWith(".easypanel.host");
}

/** Apex de marketing (`bwipo.com` / `www`) — identifica org pelo e-mail. */
export function isMarketingApexHost(hostname: string): boolean {
  if (isSingleHostCrm(hostname)) return false;
  const host = hostname.trim().toLowerCase().split(":")[0] ?? "";
  const base = getTenantBaseDomain();
  return host === base || host === `www.${base}`;
}

export type TenantHostResolution =
  | { kind: "apex" }
  | { kind: "tenant"; slug: string }
  | { kind: "unknown"; slug: string };

export function isValidTenantSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && !RESERVED_TENANT_SLUGS.has(slug);
}

/**
 * Extrai o label de tenant do host.
 * Retorna null quando o host é apex (sem subdomain de org).
 */
function extractSubdomainLabel(
  hostname: string,
  baseDomain: string,
): string | null {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return null;

  // Dev: `{slug}.localhost`
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return null;
  }
  if (host.endsWith(".localhost")) {
    const label = host.slice(0, -".localhost".length).split(".")[0] ?? "";
    return label || null;
  }

  // Produção / staging: `{slug}.{baseDomain}` ou apex `{baseDomain}`
  if (host === baseDomain) return null;
  if (host.endsWith(`.${baseDomain}`)) {
    const prefix = host.slice(0, -(baseDomain.length + 1));
    // Só o primeiro label conta como tenant (a.b.base → inválido / unknown)
    if (!prefix || prefix.includes(".")) {
      return prefix.includes(".") ? `__invalid__` : null;
    }
    return prefix;
  }

  // Host de preview / easypanel / IP: sem tenant por host
  return null;
}

export function resolveTenantFromRequest(input: {
  hostHeader: string | null;
  /** Só usado quando o Host é apex/local (sem subdomain de org). */
  overrideSlug?: string | null;
}): TenantHostResolution {
  const hostHeader = (input.hostHeader ?? "").trim().toLowerCase();
  const hostname = hostHeader.split(":")[0] ?? "";
  const baseDomain = getTenantBaseDomain();
  const label = extractSubdomainLabel(hostname, baseDomain);

  // Host com subdomain sempre ganha — não deixar cookie/header sobrescrever.
  if (label !== null) {
    if (label === "__invalid__") {
      return { kind: "unknown", slug: hostname };
    }
    // www/app/api/… → marketing/apex (não 404)
    if (RESERVED_TENANT_SLUGS.has(label)) return { kind: "apex" };
    if (!isValidTenantSlug(label)) {
      return { kind: "unknown", slug: label };
    }
    return { kind: "tenant", slug: label };
  }

  // Apex / localhost: permite override de dev via header `x-tenant-slug`.
  const override = (input.overrideSlug ?? "").trim().toLowerCase();
  if (override) {
    if (isValidTenantSlug(override)) return { kind: "tenant", slug: override };
    return { kind: "unknown", slug: override };
  }

  return { kind: "apex" };
}
