/**
 * Bootstrap do shell — `GET /api/me/bootstrap` (backend, PR #89).
 *
 * Na abertura de qualquer rota autenticada o shell disparava ~9 GETs
 * independentes (perfil, preferências, permissões, org, alert-config,
 * status do agente, contas de e-mail, salas do chat, widgets). O backend
 * agrega tudo numa resposta; aqui ela é pedida UMA vez por carga de
 * página (por identidade `userId|organizationId`) e os blocos são
 * semeados no TanStack Query **nas mesmas chaves e formatos que as telas
 * já consomem** (`setQueryData`), então nenhum consumidor muda.
 *
 * Como os hooks evitam o GET próprio sem serem gateados por render:
 *   - `<ShellBootstrap />` (layout `(app)`) chama `startShellBootstrap`
 *     DURANTE o render — padrão `usePrefetchQuery` — para a tentativa
 *     existir antes de qualquer `queryFn` filho rodar (effects vêm depois).
 *   - cada `queryFn` do shell passa por `fromShellBootstrap(ctx.client,
 *     pick, fallback)`: se a tentativa está em voo, espera e usa o bloco;
 *     se já terminou (ou não existe), faz o GET individual de sempre.
 *     Regra: o bootstrap só serve queryFns que estavam ESPERANDO por ele.
 *     Um queryFn que roda depois (stale, invalidação por SSE/mutação) é o
 *     RQ pedindo dado fresco → GET real. A semeadura nunca congela nada.
 *
 * Fallback: 404/501 (backend antigo) marca a página como "sem bootstrap"
 * e tudo cai nos GETs de hoje, sem erro visível. Qualquer outra falha
 * (401, 500, rede, timeout, payload inválido) também cai no caminho
 * antigo — só para esta tentativa. Preview mode nunca chama o endpoint
 * (o mock de rotas responde 200 genérico a qualquer GET).
 *
 * Bloco `null` = sem permissão ou falha no backend (`failedBlocks`): não
 * é semeado e o hook correspondente faz o GET individual (que hoje já
 * responderia 403/erro do mesmo jeito).
 *
 * Fora daqui, de propósito: `teamChatRooms` (o resumo não tem `members`/
 * `peer` que a tela do chat lê da mesma chave `["team-chat-rooms"]`), e o
 * GET de `my-agent-status` (semeado, mas o hook em `agent-status.tsx`
 * — presença — não foi ligado ao wrapper nesta leva).
 *
 * ETag: o backend devolve `ETag` + `Cache-Control: private, no-store` e
 * aceita `If-None-Match` → 304. Como só há uma chamada por carga e o
 * payload (permissões, e-mails) não deve ficar em storage persistente,
 * o cliente não revalida — fica como evolução.
 */

import type { QueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import {
  DEFAULT_INBOX_ALERT_CONFIG,
  type InboxAlertConfig,
  type InboxTabAudience,
  parseInboxTabAudience,
} from "@/features/inbox-v2/inbox-alert-audience";
import { isPreviewMode } from "@/lib/preview-mode";

// ──────────────────────────────────────────────
// Contrato (espelha `services/me-bootstrap.ts` do backend)
// ──────────────────────────────────────────────

export type BootstrapBlockName =
  | "profile"
  | "preferences"
  | "effectivePermissions"
  | "organization"
  | "alertConfig"
  | "agentStatus"
  | "emailUnread"
  | "teamChatRooms"
  | "widgets";

/** Mesmo shape de `GET /api/profile` (datas como ISO string no JSON). */
export type BootstrapProfile = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarUrl: string | null;
  phone: string | null;
  signature: string | null;
  closingMessage: string | null;
  createdAt: string;
  chatTheme: string;
};

/** Mesmo shape de `GET /api/profile/preferences`. */
export type BootstrapPreferences = {
  sidebar: { items: unknown[] };
  roleSidebar: { items: unknown[] } | null;
  dashboard: unknown;
  appearance: { theme: "light" | "dark" | null } & Record<string, unknown>;
  availableKeys: string[];
};

/** Mesmo shape de `GET /api/users/:me/effective-permissions`. */
export type BootstrapEffectivePermissions = {
  permissions: string[];
  channelGrants: unknown[];
  stageGrants: unknown[];
  roles: { id: string; name: string; systemPreset: string | null }[];
  groups: unknown[];
};

/** Mesmo shape de `GET /api/organization`. */
export type BootstrapOrganization = {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  status: string;
  onboardingCompletedAt: string | null;
};

/** Mesmo shape de `GET /api/agents/me/alert-config`. */
export type BootstrapAlertConfig = {
  config: InboxAlertConfig;
  departmentIds: string[];
  /** Ausente em backend anterior ao campo. */
  tabAudience?: string | null;
};

/** Mesmo shape de `GET /api/agents/:id/status` (fallback OFFLINE incluso). */
export type BootstrapAgentStatus = {
  userId: string;
  status: string;
  availableForVoiceCalls: boolean;
  [key: string]: unknown;
};

/** Resumo de `GET /api/email-accounts`: só o que o badge do trilho usa. */
export type BootstrapEmailUnread = {
  totalUnread: number;
  accounts: { id: string; email: string; unreadCount: number }[];
};

/** Resumo de `GET /api/team-chat/rooms` (não semeado — ver cabeçalho). */
export type BootstrapTeamChatRooms = {
  totalUnread: number;
  rooms: {
    id: string;
    kind: "DM" | "GROUP" | "CHANNEL";
    name: string;
    unread: number;
    muted: boolean;
    lastMessageAt: string;
    lastPreview: string | null;
  }[];
};

/** Slugs de widgets ativos na org (derivado de `GET /api/widgets`). */
export type BootstrapWidgets = { activeSlugs: string[] };

export type MeBootstrapPayload = {
  version: 1;
  user: { id: string; organizationId: string | null; isSuperAdmin: boolean };
  profile: BootstrapProfile | null;
  preferences: BootstrapPreferences | null;
  effectivePermissions: BootstrapEffectivePermissions | null;
  organization: BootstrapOrganization | null;
  alertConfig: BootstrapAlertConfig | null;
  agentStatus: BootstrapAgentStatus | null;
  emailUnread: BootstrapEmailUnread | null;
  teamChatRooms: BootstrapTeamChatRooms | null;
  widgets: BootstrapWidgets | null;
  failedBlocks: BootstrapBlockName[];
};

export const SHELL_BOOTSTRAP_PATH = "/api/me/bootstrap";

// ──────────────────────────────────────────────
// Chaves semeadas (espelham os hooks consumidores)
// ──────────────────────────────────────────────

/**
 * Chaves do TanStack Query que o bootstrap semeia, na forma que cada
 * hook já usa. Mantidas aqui como espelho; o teste de integração garante
 * que os hooks de fato leem destas chaves.
 */
export const shellBootstrapKeys = {
  /** `useChatTheme` (`src/hooks/use-chat-theme.ts`). */
  profile: () => ["profile"] as const,
  /** `useSidebarPreferences` + sync de tema (`features/sidebar/hooks.ts`). */
  sidebarPreferences: () => ["sidebar-preferences"] as const,
  /** `useMyPermissions` (`src/hooks/use-my-permissions.ts`). */
  myPermissions: (userId: string) => ["my-permissions", userId] as const,
  /** `useOrganization` (`src/hooks/use-organization.ts`). */
  organization: (orgId: string) => ["organization", orgId] as const,
  /** `InboxMessageAlerts` (`components/layout/inbox-message-alerts.tsx`). */
  alertConfig: (userId: string) => ["agents-me-alert-config", userId] as const,
  /** `useAgentStatus` (`components/crm/agent-status.tsx`). */
  agentStatus: (userId: string) => ["my-agent-status", userId] as const,
  /** `NavMessageAlertsProvider` (`components/layout/nav-message-alerts.tsx`). */
  navEmailAccounts: () => ["nav-email-accounts"] as const,
  /** `useActiveWidgetSlugs` (`features/widgets/hooks.ts`); prefixo `["widgets"]`. */
  activeWidgetSlugs: () => ["widgets", "active-slugs"] as const,
} as const;

/** Formato consumido pela query `agents-me-alert-config`. */
export type MyAlertConfig = {
  config: InboxAlertConfig;
  departmentIds: string[];
  /** Público do aviso na aba (org); `null` = coluna "Aba" por tipo. */
  tabAudience: InboxTabAudience | null;
};

/** Mesma normalização que o GET individual aplica ao corpo cru. */
export function normalizeAlertConfigBlock(raw: {
  config?: InboxAlertConfig | null;
  departmentIds?: unknown;
  tabAudience?: unknown;
}): MyAlertConfig {
  return {
    config: raw.config ?? DEFAULT_INBOX_ALERT_CONFIG,
    departmentIds: Array.isArray(raw.departmentIds)
      ? raw.departmentIds.filter((id): id is string => typeof id === "string")
      : [],
    tabAudience: parseInboxTabAudience(raw.tabAudience),
  };
}

/** Grava cada bloco não-nulo na chave/formato do hook que o consome. */
export function seedShellBootstrapCaches(
  client: QueryClient,
  payload: MeBootstrapPayload,
): void {
  const { user } = payload;
  const k = shellBootstrapKeys;
  if (payload.profile) client.setQueryData(k.profile(), payload.profile);
  if (payload.preferences) {
    client.setQueryData(k.sidebarPreferences(), payload.preferences);
  }
  if (payload.effectivePermissions) {
    client.setQueryData(k.myPermissions(user.id), payload.effectivePermissions);
  }
  if (payload.organization && user.organizationId) {
    client.setQueryData(k.organization(user.organizationId), payload.organization);
  }
  if (payload.alertConfig) {
    client.setQueryData(
      k.alertConfig(user.id),
      normalizeAlertConfigBlock(payload.alertConfig),
    );
  }
  if (payload.agentStatus) {
    client.setQueryData(k.agentStatus(user.id), payload.agentStatus);
  }
  if (payload.emailUnread) {
    client.setQueryData(k.navEmailAccounts(), payload.emailUnread.accounts);
  }
  if (payload.widgets) {
    client.setQueryData(k.activeWidgetSlugs(), payload.widgets);
  }
}

// ──────────────────────────────────────────────
// Tentativa por QueryClient + identidade
// ──────────────────────────────────────────────

export type ShellBootstrapIdentity = {
  userId: string;
  organizationId: string | null | undefined;
};

type Attempt = {
  identity: string;
  settled: boolean;
  promise: Promise<MeBootstrapPayload | null>;
};

/** Uma tentativa viva por QueryClient (testes usam clients isolados). */
const attempts = new WeakMap<QueryClient, Attempt>();

/** 404/501 nesta carga de página: backend sem o endpoint. Não insiste. */
let unsupportedThisPage = false;

function identityKey(id: ShellBootstrapIdentity): string {
  return `${id.userId}|${id.organizationId ?? ""}`;
}

function isValidPayload(value: unknown): value is MeBootstrapPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<MeBootstrapPayload>;
  return (
    v.version === 1 &&
    !!v.user &&
    typeof v.user === "object" &&
    typeof v.user.id === "string" &&
    Array.isArray(v.failedBlocks)
  );
}

async function fetchShellBootstrap(
  identity: ShellBootstrapIdentity,
): Promise<MeBootstrapPayload | null> {
  if (typeof window === "undefined") return null;
  if (unsupportedThisPage || isPreviewMode()) return null;
  try {
    const res = await apiFetch(SHELL_BOOTSTRAP_PATH, {
      headers: { Accept: "application/json" },
    });
    if (res.status === 404 || res.status === 501) {
      unsupportedThisPage = true;
      return null;
    }
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!isValidPayload(body)) return null;
    // Sessão do cookie ≠ sessão do client (cookie trocado em outra aba):
    // os blocos seriam de outro usuário → caminho antigo.
    if (body.user.id !== identity.userId) return null;
    return body;
  } catch {
    // Rede / timeout: comportamento atual (cada hook faz o seu GET).
    return null;
  }
}

/**
 * Inicia (ou reaproveita) a tentativa para esta identidade. Idempotente
 * por `userId|organizationId`: trocar de org/usuário sem recarregar a
 * página cria uma tentativa nova e re-semeia os caches.
 *
 * Seguro no render (não lança, não muda estado React); só efeito
 * colateral é o fetch, deduplicado pela tentativa.
 */
export function startShellBootstrap(
  client: QueryClient,
  identity: ShellBootstrapIdentity,
): Promise<MeBootstrapPayload | null> {
  const key = identityKey(identity);
  const current = attempts.get(client);
  if (current && current.identity === key) return current.promise;

  const attempt: Attempt = {
    identity: key,
    settled: false,
    promise: Promise.resolve(null),
  };
  attempt.promise = fetchShellBootstrap(identity)
    .then((payload) => {
      if (payload && attempts.get(client) === attempt) {
        seedShellBootstrapCaches(client, payload);
      }
      return payload;
    })
    .finally(() => {
      attempt.settled = true;
    });
  attempts.set(client, attempt);
  return attempt.promise;
}

/**
 * Para uso dentro de um `queryFn`: devolve o bloco do bootstrap se a
 * tentativa ainda estava em voo quando o queryFn começou; senão (sem
 * tentativa, já concluída, bloco `null`) chama o `fallback` — o GET
 * individual de hoje.
 */
export async function fromShellBootstrap<T>(
  client: QueryClient | undefined,
  pick: (payload: MeBootstrapPayload) => T | null | undefined,
  fallback: () => Promise<T>,
): Promise<T> {
  const attempt = client ? attempts.get(client) : undefined;
  if (!attempt || attempt.settled) return fallback();
  const payload = await attempt.promise;
  const block = payload ? pick(payload) : undefined;
  return block ?? fallback();
}

/** Há tentativa (em voo ou concluída) para este client? Só diagnóstico/testes. */
export function hasShellBootstrapAttempt(client: QueryClient): boolean {
  return attempts.has(client);
}

/** Limpa o estado por página (flag 404/501). Para testes. */
export function resetShellBootstrapForTests(): void {
  unsupportedThisPage = false;
}
