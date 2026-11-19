/**
 * "Trocar de organização" sem logout — lado do cliente.
 *
 * Contrato (backend, `src/lib/auth/org-switch.ts`):
 *  - `GET /api/me/organizations` → orgs do MESMO e-mail da conta logada
 *    (`current`, `linked`). Autenticado; não usa o `tenant-lookup` público.
 *  - `POST /api/me/organizations/switch` `{ organizationId, password?, mfaCode?, backupCode? }`
 *    → `{ orgSwitch: { token } }`: ticket de uso único (60 s). Conta ainda não
 *    vinculada pede a senha (+MFA) da conta de DESTINO uma vez.
 *  - O ticket vira cookie novo no `update({ orgSwitch: token })` do
 *    `useSession` — quem escreve as claims é o backend; o cliente só entrega
 *    o ticket. Falhou → a sessão da org atual continua intacta.
 *
 * Depois da troca: navegação COMPLETA para `/dashboard` da org nova
 * (subdomínio em produção, mesmo host em dev/EasyPanel). Isso descarta o
 * cache do React Query, o SSE, a presença e todo estado em memória da org
 * anterior; os poucos caches locais ligados à org são apagados antes, e as
 * outras abas do navegador são avisadas para irem também (o cookie é um só).
 */

import { apiFetch, ApiError, parseApiResponse } from "@/lib/api";
import { isNativePlatform } from "@/lib/native/capacitor";
import { isSingleHostCrm } from "@/lib/tenant-host";
import { buildTenantUrl } from "@/lib/tenant-url";

export type SwitchableOrganization = {
  organizationId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  role: string;
  current: boolean;
  /** Vínculo vigente: troca sem senha. */
  linked: boolean;
};

export type SwitchableOrganizations = {
  currentOrganizationId: string | null;
  organizations: SwitchableOrganization[];
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Normaliza a resposta do `GET /api/me/organizations` (descarta itens inválidos). */
export function normalizeSwitchableOrganizations(raw: unknown): SwitchableOrganizations {
  const rec = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = Array.isArray(rec.organizations) ? rec.organizations : [];
  const seen = new Set<string>();
  const organizations: SwitchableOrganization[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const organizationId = str(o.organizationId);
    const slug = str(o.slug);
    if (!organizationId || !slug || seen.has(organizationId)) continue;
    seen.add(organizationId);
    organizations.push({
      organizationId,
      slug,
      name: str(o.name) ?? slug,
      logoUrl: str(o.logoUrl),
      role: str(o.role) ?? "MEMBER",
      current: o.current === true,
      linked: o.linked === true,
    });
  }
  return { currentOrganizationId: str(rec.currentOrganizationId), organizations };
}

export async function fetchSwitchableOrganizations(): Promise<SwitchableOrganizations> {
  const res = await apiFetch("/api/me/organizations", { cache: "no-store" });
  return normalizeSwitchableOrganizations(
    await parseApiResponse<unknown>(res, "Não foi possível carregar as organizações."),
  );
}

export type OrgSwitchRequest = {
  organizationId: string;
  password?: string;
  mfaCode?: string;
  backupCode?: string;
};

export type OrgSwitchGrant = {
  ticket: string;
  organization: { id: string; slug: string; name: string };
};

/** Pede o ticket. Erros chegam como `ApiError` com o `code` do backend. */
export async function requestOrgSwitch(body: OrgSwitchRequest): Promise<OrgSwitchGrant> {
  const res = await apiFetch("/api/me/organizations/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await parseApiResponse<Record<string, unknown>>(
    res,
    "Não foi possível trocar de organização.",
  );
  const org = (data.organization ?? {}) as Record<string, unknown>;
  const ticket = str((data.orgSwitch as Record<string, unknown> | undefined)?.token);
  const id = str(org.id);
  const slug = str(org.slug);
  if (!ticket || !id || !slug) {
    throw new ApiError("Resposta inválida do servidor.", 502, "invalid_response");
  }
  return { ticket, organization: { id, slug, name: str(org.name) ?? slug } };
}

/** Códigos de `requestOrgSwitch` que pedem (de novo) credenciais na tela. */
export function orgSwitchCredentialStep(code: string | undefined): "password" | "mfa" | null {
  if (code === "password_required" || code === "invalid_credentials") return "password";
  if (code === "mfa_required" || code === "mfa_invalid") return "mfa";
  return null;
}

/** `update()` do `useSession`. */
export type SessionUpdateFn = (data?: unknown) => Promise<unknown>;

function organizationIdOf(session: unknown): string | null {
  if (typeof session !== "object" || session === null) return null;
  const user = (session as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) return null;
  const id = (user as { organizationId?: unknown }).organizationId;
  return typeof id === "string" ? id : null;
}

async function readSessionOrganizationId(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "include" });
    return organizationIdOf(await res.json().catch(() => null));
  } catch {
    return null;
  }
}

/**
 * Troca o ticket pelo cookie da org de destino. `true` só quando a sessão
 * já está na org esperada. O ticket é de uso único: sem nova tentativa —
 * se o `update()` não devolver a sessão (provider ocupado / rede), confere
 * lendo a sessão direto.
 */
export async function applyOrgSwitch(
  update: SessionUpdateFn,
  ticket: string,
  expectedOrganizationId: string,
): Promise<boolean> {
  let session: unknown = null;
  try {
    session = await update({ orgSwitch: ticket });
  } catch {
    session = null;
  }
  if (organizationIdOf(session) === expectedOrganizationId) return true;
  return (await readSessionOrganizationId()) === expectedOrganizationId;
}

/**
 * `/dashboard` da org: mesmo origin no CRM de host único (localhost,
 * EasyPanel) — lá não existe `{slug}.base`; subdomínio da org nos demais.
 */
export function orgDashboardUrl(slug: string, location: Pick<Location, "host" | "origin">): string {
  if (isSingleHostCrm(location.host)) return `${location.origin}/dashboard`;
  return `${buildTenantUrl(slug)}/dashboard`;
}

/**
 * Destino real nesta aba. No APK (Capacitor) o app roda num host único e só
 * navega para os hosts do `allowNavigation` — mesma regra do pós-login
 * (`resolvePostLoginOrigin`): `NEXT_PUBLIC_APP_URL`, senão a origem atual.
 */
export function resolveOrgDashboardUrl(slug: string): string {
  const loc = window.location;
  if (isNativePlatform() || /^(capacitor|ionic):/.test(loc.origin)) {
    const app = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    return `${app || loc.origin}/dashboard`;
  }
  return orgDashboardUrl(slug, loc);
}

/** Caches locais ligados à org/usuário anterior (o resto é só preferência do aparelho). */
const ORG_SCOPED_LOCAL_KEYS = [
  "crm:sidebar-prefs-items",
  "crm:org-brand",
  "crm:pipeline:last-selected:v1",
  "crm:dist-pending-total",
];
const ORG_SCOPED_LOCAL_PREFIXES = ["crm:pipeline:flow:last-stage:v1:"];
const ORG_SCOPED_SESSION_KEYS = ["crm:dash-manager-up"];

export function clearOrgScopedStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const local = window.localStorage;
    for (const key of ORG_SCOPED_LOCAL_KEYS) local.removeItem(key);
    const prefixed: string[] = [];
    for (let i = 0; i < local.length; i += 1) {
      const key = local.key(i);
      if (key && ORG_SCOPED_LOCAL_PREFIXES.some((p) => key.startsWith(p))) prefixed.push(key);
    }
    for (const key of prefixed) local.removeItem(key);
  } catch {
    /* storage indisponível */
  }
  try {
    for (const key of ORG_SCOPED_SESSION_KEYS) window.sessionStorage.removeItem(key);
  } catch {
    /* storage indisponível */
  }
}

/** Aviso entre abas: `{ at, organizationId, slug }`. */
export const ORG_SWITCH_STORAGE_KEY = "crm:org-switched";

type OrgSwitchNotice = { at: number; organizationId: string; slug: string };

function parseNotice(raw: string | null): OrgSwitchNotice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<OrgSwitchNotice>;
    if (typeof v.at !== "number" || typeof v.organizationId !== "string" || typeof v.slug !== "string") {
      return null;
    }
    return { at: v.at, organizationId: v.organizationId, slug: v.slug };
  } catch {
    return null;
  }
}

/** Depois de `applyOrgSwitch` dar certo: limpa caches, avisa as abas e navega. */
export function completeOrgSwitch(
  org: { id: string; slug: string },
  navigate: (url: string) => void = (url) => window.location.replace(url),
): void {
  clearOrgScopedStorage();
  try {
    window.localStorage.setItem(
      ORG_SWITCH_STORAGE_KEY,
      JSON.stringify({ at: Date.now(), organizationId: org.id, slug: org.slug }),
    );
  } catch {
    /* sem storage: só as outras abas deixam de ser avisadas */
  }
  navigate(resolveOrgDashboardUrl(org.slug));
}

let stopWatching: (() => void) | null = null;

/**
 * Outra aba trocou de organização: o cookie (único no navegador) já é da
 * org nova, então esta aba também vai para o `/dashboard` dela em vez de
 * seguir exibindo dados da anterior. Instala uma vez por aba.
 */
export function watchOrgSwitchInOtherTabs(
  currentOrganizationId: () => string | null | undefined,
  navigate: (url: string) => void = (url) => window.location.replace(url),
): () => void {
  if (typeof window === "undefined") return () => {};
  if (stopWatching) return stopWatching;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== ORG_SWITCH_STORAGE_KEY) return;
    const notice = parseNotice(event.newValue);
    if (!notice) return;
    if (notice.organizationId === currentOrganizationId()) return;
    navigate(resolveOrgDashboardUrl(notice.slug));
  };
  window.addEventListener("storage", onStorage);
  stopWatching = () => {
    window.removeEventListener("storage", onStorage);
    stopWatching = null;
  };
  return stopWatching;
}
