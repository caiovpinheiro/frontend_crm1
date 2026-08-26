/**
 * URLs de tenant no estilo Kommo: https://{slug}.{NEXT_PUBLIC_TENANT_BASE_DOMAIN}
 *
 * Env (inlined no browser):
 *   NEXT_PUBLIC_TENANT_BASE_DOMAIN  — default `bwipo.com`
 *   NEXT_PUBLIC_TENANT_PROTOCOL     — default `https` (use `http` em dev)
 */

const DEFAULT_BASE_DOMAIN = "bwipo.com";
const DEFAULT_PROTOCOL = "https";

export function getTenantBaseDomain(): string {
  const raw = process.env.NEXT_PUBLIC_TENANT_BASE_DOMAIN?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw.replace(/^\.+/, "") : DEFAULT_BASE_DOMAIN;
}

export function getTenantProtocol(): string {
  const raw = process.env.NEXT_PUBLIC_TENANT_PROTOCOL?.trim().toLowerCase();
  if (!raw) return DEFAULT_PROTOCOL;
  return raw.replace(/:?\/?\/?$/, "").replace(/:$/, "") || DEFAULT_PROTOCOL;
}

export function buildTenantUrl(slug: string): string {
  const clean = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .split("/")[0]
    ?.split(".")[0];
  if (!clean) {
    throw new Error("Slug vazio para buildTenantUrl.");
  }
  return `${getTenantProtocol()}://${clean}.${getTenantBaseDomain()}`;
}

/** Alias de `buildTenantUrl`. */
export function tenantUrl(slug: string): string {
  return buildTenantUrl(slug);
}

/** Host de preview no form de signup (sem protocolo). */
export function tenantHostPreview(slug: string): string {
  const clean = String(slug ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "");
  const label = clean || "sua-empresa";
  return `${label}.${getTenantBaseDomain()}`;
}
