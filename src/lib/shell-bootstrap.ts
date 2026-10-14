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
 * `blocks` (contrato novo, opcional): `{ [url]: corpo }` com o corpo
 * idêntico ao da rota individual, para as rotas que o app chama na
 * abertura além do shell (canais, funis, usuários…). O mapa
 * `url → queryKey` vive em `lib/bootstrap-blocks.ts`; aqui:
 *   - cada bloco com chave conhecida é semeado (`setQueryData`, com
 *     `updatedAt` agora) antes de a tentativa ser dada como encerrada;
 *   - GETs dessas URLs feitos com a tentativa em voo esperam por ela e
 *     recebem o corpo do bloco pelo `fetch` do app (`setApiGetResolver`
 *     em `lib/api.ts`), sem rede — mesmo fora do React Query.
 * Sem `blocks` (backend antigo): nada muda. Para não segurar esses GETs à
 * toa a cada abertura, a página lembra (localStorage) que o backend não
 * manda blocos e, da próxima vez, não espera.
 *
 * ETag: o backend devolve `ETag` + `Cache-Control: private, no-cache` e
 * responde 304 a `If-None-Match`. O pedido vai com `cache: "no-cache"`: o
 * cache HTTP do navegador guarda o corpo e revalida sozinho (o 304 chega
 * ao JS como o 200 guardado) — sem storage próprio e sem precisar do
 * `ETag` exposto no CORS.
 *
 * v2 (`x-bootstrap-version: 2`, opcional): o bootstrap passa a trazer só o
 * estável + `blocks` (ETag estável → 304 frequente); os voláteis
 * (`agentStatus`, `emailUnread`, salas do chat e o que mais o backend
 * mover em `blocks`) vêm de UM `GET /api/me/live` por carga, no mesmo
 * formato, semeados nas mesmas chaves. Depois disso eles seguem
 * atualizados como hoje (SSE, polls). Backend antigo ignora o cabeçalho
 * e manda o payload v1 → sem live. Live 404 → sem o cabeçalho por 6 h.
 */

import type { QueryClient } from "@tanstack/react-query";

import { apiFetch, setApiGetResolver, setRevalidatedApiPathMatcher } from "@/lib/api";
import { liveOverlayFor, mergeLiveIntoBlock } from "@/lib/bootstrap-live-merge";
import {
  BOOTSTRAP_BLOCKS,
  findBootstrapBlock,
  isRevalidatedApiPath,
  resolveBlockUrl,
  type BootstrapBlockContext,
} from "@/lib/bootstrap-blocks";
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
  /** 2 = só o estável + `blocks`; os voláteis vêm de `GET /api/me/live`. */
  version: 1 | 2;
  user: { id: string; organizationId: string | null; isSuperAdmin: boolean };
  profile: BootstrapProfile | null;
  preferences: BootstrapPreferences | null;
  effectivePermissions: BootstrapEffectivePermissions | null;
  organization: BootstrapOrganization | null;
  alertConfig: BootstrapAlertConfig | null;
  /** Volátil: ausente na v2 (vem de `/api/me/live`). */
  agentStatus?: BootstrapAgentStatus | null;
  /** Volátil: ausente na v2 (vem de `/api/me/live`). */
  emailUnread?: BootstrapEmailUnread | null;
  /** Volátil: ausente na v2 (vem de `/api/me/live`). */
  teamChatRooms?: BootstrapTeamChatRooms | null;
  widgets: BootstrapWidgets | null;
  failedBlocks: BootstrapBlockName[];
  /**
   * Corpos das rotas individuais por `path+query` exato (contrato novo;
   * ausente em backend antigo). Valor `null` = sem permissão/falha: a
   * rota individual é chamada como hoje.
   */
  blocks?: Record<string, unknown>;
};

export const SHELL_BOOTSTRAP_PATH = "/api/me/bootstrap";

/**
 * Bootstrap v2 (contrato novo, opcional): com este cabeçalho o backend
 * devolve só o estável + `blocks` (ETag estável → 304 frequente) e os
 * campos voláteis saem de `GET /api/me/live` (`no-store`), no MESMO
 * formato dos campos antigos. Backend antigo ignora o cabeçalho e
 * responde o payload completo (v1) — aí o live não é chamado.
 */
export const BOOTSTRAP_VERSION_HEADER = "x-bootstrap-version";
export const ME_LIVE_PATH = "/api/me/live";

/**
 * Corpo de `GET /api/me/live`: os voláteis do bootstrap v1, mesmo formato
 * (`agentStatus` = GET /api/agents/:me/status; `emailUnread` = resumo de
 * GET /api/email-accounts; `teamChatRooms`), e `blocks` para o que mais o
 * backend mover (mesmo contrato `{ [url]: corpo }` do bootstrap).
 */
export type MeLivePayload = {
  user?: { id?: string } | null;
  agentStatus?: BootstrapAgentStatus | null;
  emailUnread?: BootstrapEmailUnread | null;
  teamChatRooms?: BootstrapTeamChatRooms | null;
  /**
   * `{ [url]: corpo }` (be #193: `/api/team-chat/rooms` e
   * `/api/agents/<eu>/status`), semeados pelo mesmo mapa do bootstrap.
   */
  blocks?: Record<string, unknown>;
  /** Voláteis por id dos blocos estáveis (`lib/bootstrap-live-merge.ts`). */
  usersPresence?: Record<string, unknown>;
  departmentCounts?: Record<string, unknown>;
};

/** localStorage: instante (ms) em que `/api/me/live` respondeu 404. */
export const BOOTSTRAP_V2_UNSUPPORTED_KEY = "crm:bootstrap-v2-unsupported-at";
/** Depois disto o navegador tenta a v2 de novo (o backend pode ter sido atualizado). */
export const BOOTSTRAP_V2_RETRY_MS = 6 * 60 * 60_000;

function readStoredAt(key: string): number | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

/** Manda o cabeçalho v2? Não, por `BOOTSTRAP_V2_RETRY_MS`, depois de um 404 do live. */
export function bootstrapV2Enabled(now: number = Date.now()): boolean {
  const at = readStoredAt(BOOTSTRAP_V2_UNSUPPORTED_KEY);
  return at === null || now - at >= BOOTSTRAP_V2_RETRY_MS;
}

function markBootstrapV2Unsupported(): void {
  try {
    window.localStorage.setItem(BOOTSTRAP_V2_UNSUPPORTED_KEY, String(Date.now()));
  } catch {
    /* storage bloqueado: tenta de novo na próxima carga */
  }
}

/** Resposta sem os voláteis (v2): os campos têm de vir do live. */
export function isStableOnlyPayload(payload: MeBootstrapPayload): boolean {
  if (payload.version === 2) return true;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(payload, k);
  return !has("agentStatus") && !has("emailUnread") && !has("teamChatRooms");
}

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

function blockContext(payload: MeBootstrapPayload): BootstrapBlockContext {
  return { userId: payload.user.id, organizationId: payload.user.organizationId ?? null };
}

/**
 * Semeia as chaves de `lib/bootstrap-blocks.ts` com os `blocks` do
 * payload (`updatedAt` agora: quem montar dentro do `staleTime` não
 * busca). Devolve as URLs semeadas.
 */
export function seedBootstrapBlocks(
  client: QueryClient,
  payload: MeBootstrapPayload,
  now: number = Date.now(),
): string[] {
  return seedBlocks(client, blockContext(payload), payload.blocks, now);
}

/** Semeia `{ [url]: corpo }` (bootstrap ou live) nas chaves do mapa. */
function seedBlocks(
  client: QueryClient,
  ctx: BootstrapBlockContext,
  blocks: Record<string, unknown> | undefined,
  now: number,
  opts: { only?: (url: string) => boolean; transform?: (url: string, body: unknown) => unknown } = {},
): string[] {
  if (!blocks || typeof blocks !== "object") return [];
  const seeded: string[] = [];
  for (const entry of BOOTSTRAP_BLOCKS) {
    if (!entry.queryKey) continue;
    const url = resolveBlockUrl(entry, ctx);
    if (opts.only && !opts.only(url)) continue;
    if (!Object.prototype.hasOwnProperty.call(blocks, url)) continue;
    const raw = blocks[url];
    const body = opts.transform && raw != null ? opts.transform(url, raw) : raw;
    if (body === null || body === undefined) continue;
    let data: unknown;
    try {
      data = entry.parse ? entry.parse(body) : body;
    } catch {
      continue; // formato inesperado: a query faz o GET de sempre
    }
    client.setQueryData(entry.queryKey(ctx), data, { updatedAt: now });
    seeded.push(url);
  }
  return seeded;
}

/** Voláteis (v1 no bootstrap, v2 no live) → as mesmas chaves de sempre. */
function seedVolatileCaches(
  client: QueryClient,
  userId: string,
  fields: Pick<MeBootstrapPayload, "agentStatus" | "emailUnread">,
): void {
  const k = shellBootstrapKeys;
  if (fields.agentStatus) {
    client.setQueryData(k.agentStatus(userId), fields.agentStatus);
  }
  if (fields.emailUnread) {
    client.setQueryData(k.navEmailAccounts(), fields.emailUnread.accounts);
  }
}

/**
 * Semeia o corpo de `GET /api/me/live` nas mesmas chaves que recebiam os
 * campos voláteis do bootstrap v1 (e os `blocks` que o backend mover).
 */
export function seedLiveCaches(
  client: QueryClient,
  ctx: BootstrapBlockContext,
  live: MeLivePayload,
  now: number = Date.now(),
): void {
  seedVolatileCaches(client, ctx.userId, live);
  seedBlocks(client, ctx, live.blocks, now);
}

/**
 * v2: blocos estáveis que perderam campos voláteis (`/api/users`,
 * `/api/settings/departments`) só são semeados com o live em mãos —
 * reconstruídos pelo merge único de `lib/bootstrap-live-merge.ts`. Live
 * falhou (`null`): o bloco estável como veio.
 */
function seedOverlaidBlocks(
  client: QueryClient,
  ctx: BootstrapBlockContext,
  blocks: Record<string, unknown> | undefined,
  live: MeLivePayload | null,
  now: number = Date.now(),
): void {
  seedBlocks(client, ctx, blocks, now, {
    only: (url) => !!liveOverlayFor(url),
    transform: (url, body) => mergeLiveIntoBlock(url, body, live),
  });
}

/**
 * Grava cada bloco não-nulo na chave/formato do hook que o consome.
 * `deferOverlays`: v2 — os blocos com voláteis no live esperam por ele
 * (`seedOverlaidBlocks`).
 */
export function seedShellBootstrapCaches(
  client: QueryClient,
  payload: MeBootstrapPayload,
  opts: { deferOverlays?: boolean } = {},
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
  seedVolatileCaches(client, user.id, payload);
  if (payload.widgets) {
    client.setQueryData(k.activeWidgetSlugs(), payload.widgets);
  }
  seedBlocks(client, blockContext(payload), payload.blocks, Date.now(), {
    only: opts.deferOverlays ? (url) => !liveOverlayFor(url) : undefined,
  });
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
  ctx: BootstrapBlockContext;
  /** Tudo pronto (estável + live): `fromShellBootstrap` só espera até aqui. */
  settled: boolean;
  /** Estável + voláteis (do live, quando v2). */
  promise: Promise<MeBootstrapPayload | null>;
  /** Só o estável (blocos para o `fetch` do app). */
  stable: Promise<MeBootstrapPayload | null>;
  stableSettled: boolean;
  /** `GET /api/me/live` (v2); `null` = não haverá (ou ainda não se sabe). */
  live: Promise<MeLivePayload | null> | null;
  liveSettled: boolean;
};

/** Uma tentativa viva por QueryClient (testes usam clients isolados). */
const attempts = new WeakMap<QueryClient, Attempt>();

/** 404/501 nesta carga de página: backend sem o endpoint. Não insiste. */
let unsupportedThisPage = false;

/**
 * Tentativa mais recente da página (para o `fetch` do app): só ela serve
 * blocos a GETs em voo.
 */
let liveAttempt: Attempt | null = null;

/** localStorage: "0" = o backend respondeu o bootstrap SEM `blocks`. */
export const BOOTSTRAP_BLOCKS_HINT_KEY = "crm:bootstrap-blocks";

function readBlocksHint(): string | null {
  try {
    return typeof window === "undefined"
      ? null
      : window.localStorage.getItem(BOOTSTRAP_BLOCKS_HINT_KEY);
  } catch {
    return null;
  }
}

function writeBlocksHint(hasBlocks: boolean): void {
  try {
    window.localStorage.setItem(BOOTSTRAP_BLOCKS_HINT_KEY, hasBlocks ? "1" : "0");
  } catch {
    /* storage bloqueado: só perde a dica */
  }
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", "x-crm-bootstrap-block": "1" },
  });
}

function blockBody(blocks: Record<string, unknown> | undefined, path: string): unknown {
  const body = blocks?.[path];
  return body === null || body === undefined ? undefined : body;
}

/**
 * Resolver do `fetch` do app: GET de uma URL do mapa com a tentativa em
 * voo espera e recebe o bloco (sem rede) — do bootstrap ou, se o backend
 * o moveu (URL ausente do bootstrap v2), do live. Tentativa encerrada,
 * URL fora do mapa ou backend sem blocos → `null` (rede, como hoje).
 */
export function resolveFromBootstrap(path: string): Promise<Response | null> | null {
  const attempt = liveAttempt;
  if (!attempt || attempt.settled) return null;
  if (!findBootstrapBlock(path, attempt.ctx)) return null;
  if (attempt.stableSettled && !attempt.live) return null;
  if (!attempt.stableSettled && readBlocksHint() === "0" && !attempt.live) return null;
  return (async () => {
    const stable = await attempt.stable;
    const fromStable = blockBody(stable?.blocks, path);
    if (fromStable !== undefined) {
      // Bloco estável sem os voláteis (v2): espera o live e reconstrói.
      if (attempt.live && liveOverlayFor(path)) {
        const live = await attempt.live;
        return jsonResponse(mergeLiveIntoBlock(path, fromStable, live as Record<string, unknown> | null));
      }
      return jsonResponse(fromStable);
    }
    // No bootstrap com `null` = sem permissão/falha: rede, sem esperar o live.
    if (stable?.blocks && Object.prototype.hasOwnProperty.call(stable.blocks, path)) {
      return null;
    }
    // O live (se houver) já foi decidido quando o estável resolveu.
    if (!attempt.live) return null;
    const live = await attempt.live;
    const fromLive = blockBody(live?.blocks, path);
    return fromLive !== undefined ? jsonResponse(fromLive) : null;
  })();
}

setApiGetResolver(resolveFromBootstrap);
setRevalidatedApiPathMatcher(isRevalidatedApiPath);

function identityKey(id: ShellBootstrapIdentity): string {
  return `${id.userId}|${id.organizationId ?? ""}`;
}

export function isValidPayload(value: unknown): value is MeBootstrapPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<MeBootstrapPayload>;
  return (
    (v.version === 1 || v.version === 2) &&
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
    const headers: Record<string, string> = { Accept: "application/json" };
    if (bootstrapV2Enabled()) headers[BOOTSTRAP_VERSION_HEADER] = "2";
    const res = await apiFetch(SHELL_BOOTSTRAP_PATH, {
      headers,
      // ETag: o navegador revalida com `If-None-Match` (304 → corpo guardado).
      cache: "no-cache",
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
    const blocks = (body as { blocks?: unknown }).blocks;
    const hasBlocks = !!blocks && typeof blocks === "object" && !Array.isArray(blocks);
    if (!hasBlocks) delete (body as { blocks?: unknown }).blocks;
    writeBlocksHint(hasBlocks);
    return body;
  } catch {
    // Rede / timeout: comportamento atual (cada hook faz o seu GET).
    return null;
  }
}

/**
 * `GET /api/me/live` (sem cache: muda a cada instante). 404/501 = backend
 * sem a v2 → a página deixa de mandar o cabeçalho por
 * `BOOTSTRAP_V2_RETRY_MS`. Qualquer falha → `null` (cada hook volátil faz
 * o GET de sempre).
 */
async function fetchMeLive(identity: ShellBootstrapIdentity): Promise<MeLivePayload | null> {
  try {
    const res = await apiFetch(ME_LIVE_PATH, {
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (res.status === 404 || res.status === 501) {
      markBootstrapV2Unsupported();
      return null;
    }
    if (!res.ok) return null;
    const body: unknown = await res.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const live = body as MeLivePayload;
    // Mesmo cuidado do bootstrap: resposta de outro usuário não semeia nada.
    if (live.user?.id && live.user.id !== identity.userId) return null;
    if (live.blocks !== undefined && (!live.blocks || typeof live.blocks !== "object" || Array.isArray(live.blocks))) {
      delete live.blocks;
    }
    return live;
  } catch {
    return null;
  }
}

/** Estável + voláteis do live (o live vence quando traz o campo). */
function mergeLive(stable: MeBootstrapPayload, live: MeLivePayload | null): MeBootstrapPayload {
  if (!live) return stable;
  const merged: MeBootstrapPayload = { ...stable };
  if (live.agentStatus !== undefined) merged.agentStatus = live.agentStatus;
  if (live.emailUnread !== undefined) merged.emailUnread = live.emailUnread;
  if (live.teamChatRooms !== undefined) merged.teamChatRooms = live.teamChatRooms;
  if (live.blocks) merged.blocks = { ...live.blocks, ...(stable.blocks ?? {}) };
  return merged;
}

/**
 * De onde vem o estável de uma tentativa. Padrão: a rede. Outra aba pode
 * fornecê-lo sem rede (`lib/bootstrap-share.ts`).
 */
export type StableBootstrapSource = (
  identity: ShellBootstrapIdentity,
  fetchFromNetwork: () => Promise<MeBootstrapPayload | null>,
  client: QueryClient,
) => Promise<MeBootstrapPayload | null>;

const networkSource: StableBootstrapSource = (_identity, fromNetwork) => fromNetwork();
let stableSource: StableBootstrapSource = networkSource;

export function setStableBootstrapSource(source: StableBootstrapSource | null): void {
  stableSource = source ?? networkSource;
}

/**
 * Inicia (ou reaproveita) a tentativa para esta identidade. Idempotente
 * por `userId|organizationId`: trocar de org/usuário sem recarregar a
 * página cria uma tentativa nova e re-semeia os caches.
 *
 * Seguro no render (não lança, não muda estado React); só efeito
 * colateral é o fetch, deduplicado pela tentativa.
 *
 * v2: o estável chega primeiro (semeado na hora); se ele vier sem os
 * voláteis, sai UM `GET /api/me/live` e o que ele trouxer é semeado nas
 * mesmas chaves de antes. Quem espera um volátil (`fromShellBootstrap`)
 * espera os dois.
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
    ctx: { userId: identity.userId, organizationId: identity.organizationId ?? null },
    settled: false,
    promise: Promise.resolve(null),
    stable: Promise.resolve(null),
    stableSettled: false,
    live: null,
    liveSettled: false,
  };
  const isCurrent = () => attempts.get(client) === attempt;
  attempt.stable = stableSource(identity, () => fetchShellBootstrap(identity), client)
    .catch(() => null)
    .then((payload) => {
      const wantsLive = !!payload && isStableOnlyPayload(payload) && !isPreviewMode();
      if (payload && isCurrent()) {
        seedShellBootstrapCaches(client, payload, { deferOverlays: wantsLive });
      }
      // Decide o live JÁ (antes de quem espera o estável continuar).
      if (payload && wantsLive) {
        attempt.live = fetchMeLive(identity)
          .then((live) => {
            if (isCurrent()) {
              if (live) seedLiveCaches(client, attempt.ctx, live);
              seedOverlaidBlocks(client, attempt.ctx, payload.blocks, live);
            }
            return live;
          })
          .finally(() => {
            attempt.liveSettled = true;
          });
      }
      return payload;
    })
    .finally(() => {
      attempt.stableSettled = true;
    });
  attempt.promise = attempt.stable
    .then(async (stable) => (stable ? mergeLive(stable, await attempt.live) : stable))
    .finally(() => {
      attempt.settled = true;
    });
  attempts.set(client, attempt);
  liveAttempt = attempt;
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

/** Limpa o estado por página (flag 404/501, fonte do estável). Para testes. */
export function resetShellBootstrapForTests(): void {
  unsupportedThisPage = false;
  liveAttempt = null;
  stableSource = networkSource;
}
