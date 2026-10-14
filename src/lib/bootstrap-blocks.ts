/**
 * Mapa ÚNICO `url → queryKey` dos blocos do `GET /api/me/bootstrap`.
 *
 * Contrato (backend): o bootstrap ganha `blocks: { [url]: corpo }`, onde
 * `url` é EXATAMENTE o `path+query` que o app chama hoje na abertura e
 * `corpo` é idêntico ao da rota individual. Campo ausente = comportamento
 * de antes.
 *
 * Com os blocos:
 *  1. `lib/shell-bootstrap.ts` faz `setQueryData` (com `updatedAt` agora)
 *     em cada chave daqui — quem monta depois acha o dado fresco e não
 *     dispara (dentro do `staleTime` da query);
 *  2. quem já estava esperando (GET de uma URL daqui disparado com o
 *     bootstrap em voo) recebe o corpo do bloco pelo `fetch` do app
 *     (`lib/api.ts`, `setApiGetResolver`), sem ir à rede — vale também
 *     para chamadas fora do React Query ou com outra chave;
 *  3. estas URLs (e o próprio bootstrap) usam o cache HTTP do navegador
 *     com revalidação (`cache: "no-cache"` → `If-None-Match` → 304).
 *
 * `parse` replica a transformação que o `queryFn` da chave aplica ao
 * corpo (quase sempre nenhuma). O teste `__tests__/bootstrap-blocks.test.tsx` confere
 * chave e formato contra os hooks reais.
 *
 * Para incluir uma rota: a URL tem de ser a que o código chama (sem
 * cache-busting), a chave a do hook, e o `parse` o mesmo do `queryFn`.
 */

import {
  DEPARTMENTS_QUERY_KEY,
  normalizeDepartmentList,
} from "@/features/conversations-settings/hooks/use-departments";
import { INBOX_SETTINGS_QUERY_KEY, parseInboxSettings } from "@/features/conversations-settings/hooks/use-inbox-settings";
import { ACTIVITY_ALERT_KEY } from "@/features/directory-v2/hooks";
import { parseOutboundMessagingChannels } from "@/features/inbox-v2/hooks/use-channels";
import { normalizePipelineList } from "@/features/pipeline-v2/api/board";
import { PIPELINES_QUERY_KEY } from "@/features/shared/queries/pipelines";
import { normalizeUserList, teamUsersKey } from "@/features/shared/queries/team-users";

export type BootstrapBlockContext = {
  userId: string;
  organizationId: string | null;
};

export type BootstrapBlockEntry = {
  /** Rótulo para logs/PR. */
  name: string;
  /** `path+query` exato que o app chama hoje. */
  url: string | ((ctx: BootstrapBlockContext) => string);
  /**
   * Chave do React Query que consome o corpo. `null` = só o `fetch`
   * atende (chamada fora do RQ, ou chave que depende de estado da tela).
   */
  queryKey: ((ctx: BootstrapBlockContext) => readonly unknown[]) | null;
  /** Mesma transformação do `queryFn` (padrão: o corpo como veio). */
  parse?: (body: unknown) => unknown;
};

export const BOOTSTRAP_BLOCKS: readonly BootstrapBlockEntry[] = [
  // ── Shell (layout `(app)`) ─────────────────────────────────────────
  {
    name: "team-chat-rooms",
    url: "/api/team-chat/rooms",
    // `useTeamChatRooms` (features/team-chat/hooks.ts) — `listTeamChatRooms`.
    queryKey: () => ["team-chat-rooms"],
  },
  {
    name: "my-agent-status",
    // Volátil: vem em `blocks` do `GET /api/me/live` (be #193), não do
    // bootstrap. Sem ETag (URL por função não entra em `isRevalidatedApiPath`).
    url: (ctx) => `/api/agents/${ctx.userId}/status`,
    // `useAgentStatus` (components/crm/agent-status.tsx).
    queryKey: (ctx) => ["my-agent-status", ctx.userId],
  },
  {
    name: "activity-alert",
    // GET "consumptivo" (marca o alerta como entregue): o backend decide
    // se entra no bootstrap; se entrar, o corpo é o mesmo da rota.
    url: "/api/activities/alerts",
    // `useActivityAlert` (features/directory-v2/hooks.ts).
    queryKey: () => ACTIVITY_ALERT_KEY,
  },

  // ── /pipeline?deal= (board + painel do negócio + chat) ─────────────
  {
    name: "pipelines",
    url: "/api/pipelines",
    // `usePipelinesQuery` (features/shared/queries/pipelines.ts) — `listPipelines`.
    queryKey: () => PIPELINES_QUERY_KEY,
    parse: normalizePipelineList,
  },
  {
    name: "org-settings-conversation",
    url: "/api/settings/org?prefix=conversation.",
    // `useInboxSettings` / `useConversationFeatures` — `fetchInboxSettings`.
    queryKey: () => INBOX_SETTINGS_QUERY_KEY,
    parse: parseInboxSettings,
  },
  {
    name: "field-layout-deal-panel",
    url: "/api/field-layout?context=deal_panel_v2&forUser=true",
    // `useFieldLayout("deal_panel_v2")` (hooks/use-field-layout.ts).
    queryKey: () => ["field-layout", "deal_panel_v2"],
  },
  {
    name: "card-extension-fields",
    url: "/api/custom-fields/card-extension",
    // `ExtensionOpenButton` (components/crm/deal-detail-panel.tsx).
    queryKey: () => ["custom-fields-card-extension"],
    parse: (body) => (Array.isArray(body) ? body : []),
  },
  {
    name: "channels-outbound",
    url: "/api/channels",
    // `useWhatsappChannels` (features/inbox-v2/hooks/use-channels.ts).
    queryKey: () => ["inbox-v2", "outbound-messaging-channels"],
    parse: parseOutboundMessagingChannels,
  },
  {
    name: "users-human",
    url: "/api/users",
    // `useTeamUsersQuery` sem IA (features/shared/queries/team-users.ts).
    queryKey: () => teamUsersKey(false),
    parse: (body) => normalizeUserList(body),
  },
  {
    name: "quick-replies",
    url: "/api/settings/quick-replies",
    // `useQuickReplies("")` (conversations-settings/hooks/use-quick-replies.ts).
    queryKey: () => ["settings", "quick-replies", ""],
  },
  {
    name: "quick-reply-groups",
    url: "/api/settings/quick-replies/groups",
    // `useQuickReplyGroups` (mesmo arquivo).
    queryKey: () => ["settings", "quick-reply-groups"],
  },
  {
    name: "settings-visibility",
    // Só não-admin chama (`useViewerScopeSync`); o backend pode mandar
    // para todos — admin só não lê a chave.
    url: "/api/settings/visibility",
    queryKey: () => ["settings-visibility"],
  },
  {
    name: "departments",
    url: "/api/settings/departments",
    // `useDepartments` (conversations-settings/hooks/use-departments.ts) —
    // painel do negócio (atividades) e telas de configuração.
    queryKey: () => DEPARTMENTS_QUERY_KEY,
    parse: normalizeDepartmentList,
  },
];

export function resolveBlockUrl(
  entry: BootstrapBlockEntry,
  ctx: BootstrapBlockContext,
): string {
  return typeof entry.url === "function" ? entry.url(ctx) : entry.url;
}

/** Entrada da URL (exata) para esta identidade. */
export function findBootstrapBlock(
  path: string,
  ctx: BootstrapBlockContext,
): BootstrapBlockEntry | undefined {
  return BOOTSTRAP_BLOCKS.find((entry) => resolveBlockUrl(entry, ctx) === path);
}

/**
 * Rotas com `ETag` + `Cache-Control: private, no-cache` no backend: o
 * `fetch` do app manda `cache: "no-cache"` (revalida com `If-None-Match`).
 * Casamento por `pathname` (sem a query) — os parâmetros não mudam o
 * fato de a rota ter ETag. Rotas com id (`/api/users/:id/...`) por padrão.
 */
const REVALIDATED_PATTERNS: readonly RegExp[] = [
  /^\/api\/me\/bootstrap$/,
];

function pathnameOf(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

export function isRevalidatedApiPath(path: string): boolean {
  const pathname = pathnameOf(path);
  if (REVALIDATED_PATTERNS.some((re) => re.test(pathname))) return true;
  return BOOTSTRAP_BLOCKS.some(
    (entry) => typeof entry.url === "string" && pathnameOf(entry.url) === pathname,
  );
}
