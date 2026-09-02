"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useBulkOperation, isBulkOperationFinished } from "@/hooks/use-bulk-operation";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCan, useMyPermissions } from "@/hooks/use-my-permissions";
import { listAllowedInboxTabsForUser } from "@/lib/authz/scope-grants-shared";
import { toast } from "sonner";
import {
  IconArrowLeft,
  IconBell,
  IconBellOff,
  IconBriefcase,
  IconChevronDown,
  IconChevronsDown,
  IconChevronsUp,
  IconChevronUp,
  IconCircleCheck,
  IconDeviceLaptop,
  IconMessageCircle,
  IconRotateClockwise,
  IconSquareCheck,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { usesWhatsapp24hWindow } from "@/components/inbox/channel-type-icon";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { ButtonGlass } from "@/components/crm/button-glass";
import { TagChip } from "@/components/crm/tag-chip";

import { NavRail } from "@/components/crm/nav-rail";
import { ConversationColumn } from "@/components/crm/conversation-column";
import { ChatArea } from "@/components/crm/chat-area";
import type { Message as BubbleMessage } from "@/components/crm/message-bubble";
import { usePinDurationDialog } from "@/components/crm/pin-duration-dialog";
import { FavoritesPanel } from "@/components/crm/favorites-panel";
import { ContactAside } from "@/components/crm/contact-aside";
import { UserAvatar } from "@/components/crm/user-avatar";
import { FieldConfigPanel } from "@/components/crm/fields/field-config-panel";
import { PageHeader } from "@/components/crm/page-header";
import { InboxPeriodCalendar } from "@/features/inbox-v2/extras/inbox-period-calendar";
import {
  ColumnResizer,
  usePersistentWidth,
} from "@/components/crm/column-resizer";
import { useIsDesktop } from "@/hooks/use-media-query";
import { COMPOSER_FOCUS_CHAT_EVENT } from "@/lib/composer-insert";

import {
  isWhatsappComposerSessionExpired,
  lastInboundAtFromThread,
  toChatContact,
  toContactAside,
  toConversationCard,
  toMessageBubble,
} from "@/features/inbox-v2/adapters";
import {
  useBulkConversationAction,
  useChannelSession,
  useConversationById,
  useConversationFeatures,
  useConversations,
  useContactSidebar,
  useInboxRealtime,
  useFavoriteMessage,
  useMarkConversationRead,
  useMessages,
  usePinMessage,
  useUnpinMessage,
  useReactMessage,
  useSelectedOutboundChannel,
  useSendMessage,
  useTabCounts,
  useWhatsappChannels,
  findLastPublicMessageChannelId,
  useInboxSoundMuted,
  useInboxUrlSync,
  matchesConversationUrlRef,
  inboxConversationApiId,
  CONVERSATION_REOPENED_EVENT,
} from "@/features/inbox-v2/hooks";
import {
  AssigneePopover,
  BulkReassignPopover,
  Composer,
  ConversationActionsMenu,
  ConversationTimelineTab,
  InboxFilterButton,
  ResolveConfirmDialog,
  TabulationDialog,
  TagsPopover,
  TransferPopover,
  WhatsappTemplatePickerModal,
  whatsappTemplateToPending,
  type PendingTemplate,
} from "@/features/inbox-v2/extras";
import { pickBulkCloseDepartment } from "@/features/inbox-v2/extras/tabulation-dialog";
import { useUserRole } from "@/hooks/use-user-role";
import { InboxSearchFilterBar } from "@/features/inbox-v2/extras/filter-panel";
import {
  isSessionClosedError,
  SESSION_CLOSED_TOAST,
} from "@/features/inbox-v2/extras/channel-switch-confirm";
import type { ConversationListRow, InboxTab } from "@/features/inbox-v2/api";
import { postConversationAction } from "@/features/inbox-v2/api";
import { inboxQueueTabFor, pickVisibleInboxTab } from "@/features/inbox-v2/inbox-queue-tab";
import {
  DEFAULT_INBOX_TAB,
  useInboxFilterUrlState,
} from "@/features/inbox-v2/hooks/use-inbox-filters-url-sync";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  dealDetailKey,
  useDealDetail,
  usePipelines,
} from "@/features/pipeline-v2/hooks";
import { getDeal } from "@/features/pipeline-v2/api";
import { StagePicker } from "@/features/pipeline-v2/extras/stage-picker";
import { AssigneePopover as DealOwnerPopover } from "@/features/pipeline-v2/extras/assignee-popover";
import { MoveToStageMenu } from "@/features/pipeline-v2/extras/move-to-stage-menu";
import { DealTagsPopover } from "@/features/pipeline-v2/extras/deal-tags-popover";
import { ContactTagsPopover } from "@/features/inbox-v2/extras/contact-tags-popover";
import { CallHistoryList } from "@/features/softphone/components/call-history-list";
import { DealCallButton } from "@/features/softphone/components/deal-call-button";
import {
  conversationHasCallingHint,
  WhatsappCallChip,
} from "@/components/inbox/whatsapp-call-chip";
import { ActivitiesPanel } from "@/components/pipeline/deal-workspace/panels/activities";
import { DealNotesTab } from "@/features/pipeline-v2/extras";
import type { PipelineListStageDto } from "@/features/pipeline-v2/api";

// ── DealTagsTray — chips das tags do negócio + botão para adicionar/remover.
// Mostra as 2 primeiras; a lista completa fica no popover ("Selecionadas").
function DealTagsTray({
  dealId,
  currentTags,
}: {
  dealId: string;
  currentTags: { id: string; name: string; color: string | null }[];
}) {
  const MAX_VISIBLE = 2;
  const visible = currentTags.slice(0, MAX_VISIBLE);

  function chip(t: { id: string; name: string; color: string | null }) {
    return (
      <TooltipGlass key={t.id} label={t.name} side="top">
        <TagChip
          name={t.name}
          color={t.color}
          className="h-5 min-w-0 max-w-[12rem] shrink"
        />
      </TooltipGlass>
    );
  }

  // Uma linha: chips truncam com tooltip; "+" fixo à direita. Excedente
  // fica em "Selecionadas" no popover.
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
      {visible.map(chip)}
      <span className="ml-auto shrink-0 pl-1">
        <DealTagsPopover dealId={dealId} currentTags={currentTags} />
      </span>
    </div>
  );
}

// ── ContactTagsTray — mesmo padrao de DealTagsTray, so troca o popover ──
function ContactTagsTray({
  contactId,
  currentTags,
}: {
  contactId: string;
  currentTags: { id: string; name: string; color: string | null }[];
}) {
  const MAX_VISIBLE = 2;
  const visible = currentTags.slice(0, MAX_VISIBLE);

  function chip(t: { id: string; name: string; color: string | null }) {
    return (
      <TooltipGlass key={t.id} label={t.name} side="top">
        <TagChip
          name={t.name}
          color={t.color}
          className="h-5 min-w-0 max-w-[12rem] shrink"
        />
      </TooltipGlass>
    );
  }

  // Mesmo layout do DealTagsTray: uma linha, "+" à direita.
  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-1 overflow-hidden">
      {visible.map(chip)}
      <span className="ml-auto shrink-0 pl-1">
        <ContactTagsPopover contactId={contactId} currentTags={currentTags} triggerVariant="icon" />
      </span>
    </div>
  );
}

// Ordem das tabs alinhada ao legado (`conversation-list.tsx`
// TAB_ORDER). "Agente IA" lista conversas cujo responsável é um usuário
// `type: AI` — sai daqui no handoff (vira Entrada, com ou sem consultor).
// "Automação" lista conversas cujo contato tem automação RUNNING (fila de
// automação). "Erro" = OPEN + hasError (falha de envio); encerradas não
// entram — hasError sticky em RESOLVED poluía a aba.
const TABS: ReadonlyArray<{ id: InboxTab; label: string; title?: string }> = [
  { id: "todos", label: "Todas" },
  { id: "entrada", label: "Entrada" },
  { id: "esperando", label: "Aguardando" },
  { id: "respondidas", label: "Respondidas" },
  { id: "ligar", label: "Ligar", title: "WhatsApp com permissão de ligação ativa" },
  {
    id: "agente_ia",
    label: "Agente IA",
    title: "Conversas em atendimento pelo Agente IA",
  },
  { id: "automacao", label: "Automação" },
  { id: "finalizados", label: "Encerradas" },
  { id: "erro", label: "Erro" },
];

function inIsoDayRange(
  iso: string | null | undefined,
  from?: string,
  to?: string,
): boolean {
  if (!from && !to) return true;
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

/**
 * Props opcionais — usadas para reaproveitar o chat dentro de um shell
 * diferente (ex.: segmento real `/v2/inbox` que injeta o `<NavRailV2 />`
 * com hrefs novos). Sem nada passado, o componente mantém o comportamento
 * legado: renderiza o `<NavRail />` antigo internamente.
 */
interface InboxV2ClientPageProps {
  /** Override do trilho de navegação (1ª coluna). */
  navRail?: React.ReactNode;
  /**
   * Metadados do cabeçalho de página opcional, renderizado ACIMA das
   * colunas (estilo "Caixa de entrada" do DS de referência). Quando
   * presente, a busca e o filtro sobem para este header (pílula à
   * direita, calendário nas actions) e somem da coluna de conversas. Quando
   * ausente, mantém o layout legado de linha única (busca/filtro na
   * própria coluna) — usado por `(v2)/inbox-v2`.
   */
  pageHeader?: {
    icon: React.ReactNode;
    title: string;
  };
}

export default function InboxV2ClientPage({
  navRail,
  pageHeader,
}: InboxV2ClientPageProps = {}) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const isAuthenticated = sessionStatus === "authenticated";
  const isDesktop = useIsDesktop();
  const { data: myPermissions } = useMyPermissions();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const { isSuperAdmin } = useUserRole();
  const canSkipAutomations = isSuperAdmin || sessionRole === "ADMIN";

  const visibleTabs = useMemo(() => {
    const role = sessionRole ?? null;
    if (role === "ADMIN" || role === "MANAGER") return TABS;
    // Enquanto carrega permissions: default operacional (evita flash de Automação/Entrada).
    if (!myPermissions) {
      return TABS.filter(
        (t) =>
          t.id === "todos" ||
          t.id === "esperando" ||
          t.id === "respondidas" ||
          t.id === "ligar",
      );
    }
    const allowed = new Set<string>(
      listAllowedInboxTabsForUser({
        grants: {},
        role,
        permissions: myPermissions.permissions,
      }),
    );
    return TABS.filter((t) => allowed.has(t.id));
  }, [sessionRole, myPermissions]);

  // ── Largura das colunas (persistidas) ─────────────────────────
  const [convWidth, setConvWidth] = usePersistentWidth(
    "inbox-v2:conv-width",
    300,
  );
  const [asideWidth, setAsideWidth] = usePersistentWidth(
    "inbox-v2:aside-width",
    300,
  );

  // ── Estado de UI local ─────────────────────────────────────────
  // Aba, busca e filtros vivem na URL (`?tab=&q=&owner=…`) — o link da barra
  // de endereço reproduz a visão no F5, no compartilhamento e no Voltar. Sem
  // query, cai no localStorage (última visão do operador) e default
  // "esperando" (Aguardando).
  const {
    tab,
    setTab,
    replaceTab,
    tabHydrated,
    filters,
    setFilters,
    filtersHydrated,
    search: searchInput,
    setSearch: setSearchInput,
  } = useInboxFilterUrlState();
  // Se a aba da URL/localStorage não for permitida para o papel, cai na
  // primeira visível.
  useEffect(() => {
    if (!tabHydrated || visibleTabs.length === 0) return;
    // Enquanto o RBAC não chegou, `visibleTabs` é um subset — não
    // reescrever a aba da URL (deep-link `tab=entrada` da fila de espera).
    if (sessionRole !== "ADMIN" && sessionRole !== "MANAGER" && !myPermissions) {
      return;
    }
    if (!visibleTabs.some((t) => t.id === tab)) {
      setTab(visibleTabs[0]?.id ?? DEFAULT_INBOX_TAB);
    }
  }, [tabHydrated, visibleTabs, tab, setTab, sessionRole, myPermissions]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  // Template escolhido no modal (sessão expirada) → abre o painel no Composer.
  const [externalTemplate, setExternalTemplate] = useState<PendingTemplate | null>(null);
  const [asideCollapsed, setAsideCollapsed] = useState(false);
  // Sem conversa ativa, força o aside a ficar colapsado — evita a "faixa
  // fantasma" branca à direita no F5 (aside visível mas sem contato pra
  // exibir). Assim que o operador seleciona uma conversa, respeita a
  // preferência do usuário (`asideCollapsed`).
  const [mobilePaneTab, setMobilePaneTab] = useState<"chat" | "negocio">("chat");

  // Colapso do cabeçalho de página (ícone + título + busca) — ganha altura
  // pra o chat e para o painel de contato. Persistido em localStorage;
  // hidratado com `useLayoutEffect` pra evitar flash no F5.
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const [headerHydrated, setHeaderHydrated] = useState(false);
  useLayoutEffect(() => {
    try {
      setHeaderCollapsed(
        window.localStorage.getItem("inbox:header-collapsed") === "1",
      );
    } catch {
      /* ignore */
    }
    setHeaderHydrated(true);
  }, []);
  useEffect(() => {
    if (!headerHydrated) return;
    try {
      window.localStorage.setItem(
        "inbox:header-collapsed",
        headerCollapsed ? "1" : "0",
      );
    } catch {
      /* ignore */
    }
  }, [headerCollapsed, headerHydrated]);

  // ── Seleção múltipla + ações em massa (encerrar/reabrir) ────────
  // Modo explícito (como o legado): entrar em "seleção" desativa o clique
  // de abrir conversa nos cards (só o checkbox alterna), evitando abrir a
  // conversa errada por engano ao marcar várias.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // "Selecionar todas do filtro" — encerra TODAS as conversas do filtro atual
  // (todas as páginas, não só as carregadas). O backend resolve os ids pelo
  // mesmo `where` da lista e processa no leads-worker.
  const [selectAllFilter, setSelectAllFilter] = useState(false);
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm();
  const [bulkTabulationOpen, setBulkTabulationOpen] = useState(false);
  const [bulkTabulationDeptId, setBulkTabulationDeptId] = useState<string | null>(
    null,
  );
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const pendingBulkRef = useRef<{
    useAllInFilter: boolean;
    ids: string[];
  } | null>(null);
  // Encerramento em massa roda no leads-worker (async). Guardamos o id da
  // BulkOperation pra pollar progresso e dar feedback ao terminar.
  const [bulkOpId, setBulkOpId] = useState<string | null>(null);
  const bulkSkippedRef = useRef(0);
  const bulkKindRef = useRef<"resolve" | "assign" | "unassign">("resolve");
  const canBulkAssign =
    useCan("conversation:reassign_others") || useCan("conversation:transfer");

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setSelectAllFilter(false);
  }

  function toggleSelectOne(id: string) {
    // Qualquer toggle manual sai do modo "todas do filtro".
    setSelectAllFilter(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Trocar de aba muda o conjunto de conversas visíveis — limpa a seleção
  // pra não arrastar ids que já não aparecem na lista atual.
  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllFilter(false);
  }, [tab]);

  // Ao abrir uma nova conversa no mobile, volta sempre para o painel Chat.
  useEffect(() => {
    setMobilePaneTab("chat");
  }, [activeId]);

  // "Enviar produto" na aba Negócio: o Composer só existe na aba Chat —
  // troca o painel pra montar o composer e aplicar o texto pendente.
  useEffect(() => {
    function onFocusChat() {
      setMobilePaneTab("chat");
    }
    window.addEventListener(COMPOSER_FOCUS_CHAT_EVENT, onFocusChat);
    return () => {
      window.removeEventListener(COMPOSER_FOCUS_CHAT_EVENT, onFocusChat);
    };
  }, []);

  // ── Dados ───────────────────────────────────────────────────────
  // Ordenação e direção da última msg são CLIENT-SIDE (evita refetch).
  // `windowState` (Sessão da Meta Aberta/Fechada) vai ao servidor — senão o badge Erro
  // conta 233 e a lista filtra no cliente até ficar vazia.
  const {
    sortBy,
    sortOrder,
    lastMessageDirection,
    lastMessageFrom,
    lastMessageTo,
    createdFrom,
    createdTo,
    ...serverFilters
  } = filters;

  const {
    data: listData,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    isError: isListError,
  } = useConversations({
    tab,
    filters: serverFilters,
    search: "",
    // Só busca depois da sessão + prefs (tab/filtros do localStorage).
    // Sem isso: (1) query disabled → isLoading=false → empty flash;
    // (2) fetch com tab default "esperando" antes de hidratar a aba salva.
    enabled: isAuthenticated && tabHydrated && filtersHydrated,
  });
  const handleLoadMore = useCallback(() => {
    if (!hasNextPage || isFetchingNextPage || isPlaceholderData) return;
    void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isPlaceholderData, fetchNextPage]);
  const rawRows = (listData?.items ?? []).filter(Boolean);

  // Skeleton até a 1ª resposta da lista (mesmo se items=[]).
  // NÃO usar só isLoading: no RQ v5 há frame com enabled=true,
  // isPending + fetchStatus=idle → isLoading=false + data=undefined → empty flash.
  const listBootstrapping =
    sessionStatus === "loading" ||
    !tabHydrated ||
    !filtersHydrated ||
    (isAuthenticated && !listData && !isListError);

  // Ordena (default: última atividade primeiro) e filtra a janela de 24h.
  // Usa `lastMessageAt` (com fallback p/ `lastInboundAt`) para casar a ordem
  // com o `time` exibido no card — que também usa `lastMessageAt ?? lastInboundAt`
  // (ver `toConversationCard` em adapters.ts). Sem isso, mensagens outbound
  // recentes "puxam" o tempo no card mas não a posição na lista, parecendo
  // desordenado pro operador.
  // `lastMessageAt` só é tocado por NOVAS mensagens (in ou out), nunca por
  // leitura — então a posição continua estável ao marcar como lida (motivo
  // original pra evitar `updatedAt`).
  const rows = useMemo(() => {
    let list = rawRows;
    if (lastMessageDirection) {
      list = list.filter((r) => {
        const direction = String(
          r.lastMessage?.direction ?? r.lastMessagePreview?.direction ?? "",
        ).toLowerCase();
        return lastMessageDirection === "out"
          ? direction === "out" || direction === "outbound"
          : direction === "in" || direction === "inbound";
      });
    }
    if (lastMessageFrom || lastMessageTo) {
      list = list.filter((r) =>
        inIsoDayRange(r.lastMessageAt ?? r.lastInboundAt, lastMessageFrom, lastMessageTo),
      );
    }
    if (createdFrom || createdTo) {
      list = list.filter((r) => inIsoDayRange(r.createdAt, createdFrom, createdTo));
    }
    const by = sortBy ?? "lastInboundAt";
    const sign = (sortOrder ?? "desc") === "asc" ? 1 : -1;
    const ts = (v: string | null | undefined) => (v ? new Date(v).getTime() : 0);
    const lastActivityTs = (r: typeof rawRows[number]) =>
      ts(r.lastMessageAt ?? r.lastInboundAt);
    return [...list].sort((a, b) => {
      if (by === "unreadCount") {
        const d = (b.unreadCount ?? 0) - (a.unreadCount ?? 0);
        return d !== 0 ? d : lastActivityTs(b) - lastActivityTs(a);
      }
      return sign * (lastActivityTs(a) - lastActivityTs(b));
    });
  }, [rawRows, lastMessageDirection, lastMessageFrom, lastMessageTo, createdFrom, createdTo, sortBy, sortOrder]);

  const { data: tabCounts } = useTabCounts(
    isAuthenticated && tabHydrated && filtersHydrated,
    serverFilters,
  );

  // Uma fonte: badge da aba = select-all N. `list.total` ainda pode ser o
  // sentinela pageSize+1 (26) se a API antiga estiver no ar.
  const badgeTotal = tabCounts?.[tab];
  const filterTotal =
    typeof badgeTotal === "number" && badgeTotal > 0
      ? badgeTotal
      : listData?.total;

  // ── Sticky activeRow ────────────────────────────────────────────
  // A `rows` reflete o filtro da aba atual (ex.: "entrada"). Se o
  // agente envia uma mensagem outbound, a conversa pode deixar de
  // pertencer ao filtro (move pra "respondidas") e sumir de `rows`.
  // Sem snapshot, `rows.find` devolve undefined e a janela do chat
  // fecha sozinha. Mantemos a ultima row vista enquanto o user nao
  // trocar de conversa explicitamente.
  const [stickyRow, setStickyRow] = useState<ConversationListRow | null>(null);
  const [pinnedFromSearch, setPinnedFromSearch] = useState<ConversationListRow | null>(null);

  const displayRows = useMemo(() => {
    if (!pinnedFromSearch) return rows;
    const rest = rows.filter((r) => r.id !== pinnedFromSearch.id);
    return [pinnedFromSearch, ...rest];
  }, [rows, pinnedFromSearch]);

  // Conversa ativa presente na lista carregada da aba/filtro atual?
  const foundActiveRow = useMemo(
    () =>
      activeId
        ? displayRows.find((r) => matchesConversationUrlRef(r, activeId)) ??
          rows.find((r) => matchesConversationUrlRef(r, activeId)) ??
          null
        : null,
    [displayRows, rows, activeId],
  );

  // Deep-link: se o id da URL (ou de qualquer seleção) não estiver na lista
  // carregada — supervisor abrindo o link de outra aba/filtro/página, ou
  // conversa que saiu do filtro — busca a conversa direto pelo id para abri-la
  // mesmo assim. Erro (404 sem acesso / inexistente) é tratado abaixo.
  //
  // Se já temos sticky do mesmo id (ex.: acabou de Encerrar e a conversa
  // saiu da aba "abertas"/"entrada"), NÃO refetch — evita corrida que
  // dispara toast "Erro ao carregar conversa" no caminho feliz.
  const needsDeepLinkFetch =
    Boolean(activeId) &&
    !foundActiveRow &&
    !(stickyRow && matchesConversationUrlRef(stickyRow, activeId));
  const {
    data: deepLinkRow,
    error: deepLinkError,
  } = useConversationById(needsDeepLinkFetch ? activeId : null);

  useEffect(() => {
    if (!activeId) {
      setStickyRow(null);
      setPinnedFromSearch(null);
      return;
    }
    if (foundActiveRow) {
      setStickyRow(foundActiveRow);
      if (foundActiveRow.id !== activeId) setActiveId(foundActiveRow.id);
      return;
    }
    // Não está na lista: usa a conversa buscada pelo id/número (deep-link).
    if (deepLinkRow && matchesConversationUrlRef(deepLinkRow, activeId)) {
      setStickyRow(deepLinkRow);
      setPinnedFromSearch(deepLinkRow);
      if (deepLinkRow.id !== activeId) setActiveId(deepLinkRow.id);
      const queue = pickVisibleInboxTab(inboxQueueTabFor(deepLinkRow), visibleTabs);
      if (queue && queue !== tab) replaceTab(queue);
      return;
    }
    // Reabrir (novo ticket) / troca de id: não manter header do ticket antigo.
    setStickyRow((prev) =>
      prev && matchesConversationUrlRef(prev, activeId) ? prev : null,
    );
  }, [activeId, foundActiveRow, deepLinkRow, visibleTabs, tab, replaceTab]);

  // Deep-link inválido (id inexistente ou sem permissão): avisa e limpa a
  // seleção/URL para o supervisor cair no estado vazio, sem chat "fantasma".
  // IMPORTANTE (F5): só decide que é inválido DEPOIS que a lista carregou
  // (`listData` definido). No reload, a busca por id pode falhar numa corrida
  // (ex.: endpoint indisponível) ANTES da lista chegar — resetar aqui nesse
  // instante derrubava a conversa que o F5 deveria manter aberta. Esperar a
  // lista settlar garante que a conversa em `rows` (foundActiveRow) tenha
  // chance de reidratar antes de qualquer reset.
  //
  // Também ignora erro se ainda há sticky do activeId — conversa só saiu
  // do filtro da aba (Encerrar), não é deep-link inválido.
  useEffect(() => {
    if (needsDeepLinkFetch && deepLinkError && listData !== undefined) {
      if (foundActiveRow) return;
      if (stickyRow && matchesConversationUrlRef(stickyRow, activeId)) return;
      toast.error(
        deepLinkError.message || "Conversa não encontrada ou sem permissão.",
      );
      setActiveId(null);
    }
  }, [needsDeepLinkFetch, deepLinkError, listData, stickyRow, activeId, foundActiveRow]);

  const conversationApiId = inboxConversationApiId(
    activeId,
    foundActiveRow ??
      (deepLinkRow && matchesConversationUrlRef(deepLinkRow, activeId)
        ? deepLinkRow
        : null) ??
      (stickyRow && matchesConversationUrlRef(stickyRow, activeId)
        ? stickyRow
        : null),
  );

  const activeRow = stickyRow;
  const { closeActiveConversation } = useInboxUrlSync(
    activeId,
    setActiveId,
    activeRow?.number,
    activeRow?.id,
  );
  const activeContactId = activeRow?.contact?.id ?? null;

  // Se não há conversa ativa, o aside não tem o que mostrar — força
  // colapso pra evitar o "vazio branco" que dá sensação de fantasma no
  // F5. Toggle manual continua funcionando quando há activeRow.
  const effectiveAsideCollapsed = asideCollapsed || !activeRow;

  const {
    data: messagesData,
    fetchOlder,
    hasOlder,
    hasOlderTickets,
    isFetchingOlder,
    isPending: messagesPending,
    isError: messagesFailed,
  } = useMessages(conversationApiId);
  const messages = messagesData?.messages ?? [];
  const sessionInfo = messagesData?.session;

  const { data: contactDetail } = useContactSidebar(activeContactId);

  // ── Realtime ────────────────────────────────────────────────────
  // Só após prefs (tab/filtros) — evita invalidate lista+counts no
  // connect enquanto a query key ainda está mudando no hydrate.
  useInboxRealtime({
    activeConversationId: conversationApiId,
    currentUserId: session?.user?.id ?? null,
    enabled: isAuthenticated && tabHydrated && filtersHydrated,
  });

  /**
   * Após reopen (modelo de ticket): seleciona o id novo e, se o operador
   * estiver na aba Encerradas (`finalizados`), troca para Todas — o ticket
   * OPEN não aparece em Encerradas; sem a troca, a lista some, o sticky do
   * id antigo é limpo e o deep-link pode disparar toast de erro.
   */
  function handleReopenNewConversation(newId: string) {
    setActiveId(newId);
    setTab((current) => (current === "finalizados" ? "todos" : current));
  }

  // Envio (texto/anexo/áudio) numa conversa encerrada reabre como NOVO
  // ticket — os botões de anexo disparam este evento global (estão fundos
  // demais na árvore pra prop-drilling). Troca o chat ativo pro id novo.
  useEffect(() => {
    function onReopened(e: Event) {
      const newId = (e as CustomEvent<{ newId: string }>).detail?.newId;
      if (!newId) return;
      setActiveId(newId);
      setTab((current) => (current === "finalizados" ? "todos" : current));
    }
    window.addEventListener(CONVERSATION_REOPENED_EVENT, onReopened);
    return () => window.removeEventListener(CONVERSATION_REOPENED_EVENT, onReopened);
  }, []);

  // ── Mutations ───────────────────────────────────────────────────
  const sendMessage = useSendMessage(conversationApiId);
  const reactMessage = useReactMessage(conversationApiId);
  const pinMessage = usePinMessage(conversationApiId);
  const unpinMessage = useUnpinMessage(conversationApiId);
  const favoriteMessageMutation = useFavoriteMessage(conversationApiId);
  const markRead = useMarkConversationRead();
  const bulkAction = useBulkConversationAction();
  const { requestDuration: requestPinDuration, dialog: pinDurationDialog } = usePinDurationDialog();
  const [favoritesOpen, setFavoritesOpen] = useState(false);

  // Handler de reação disparado pelo menu contextual de cada bubble.
  // WhatsApp: apertar o mesmo emoji novamente remove; escolher outro
  // substitui. Repassamos `""` pra remoção (backend interpreta como
  // toggle-off + envia reaction vazia à Meta pra limpar no cliente).
  function handleReactMessage(msg: { id: string }, emoji: string | null) {
    if (!conversationApiId) return;
    // `null` = abrir picker (UI); não muta. `""` = remover reação.
    if (emoji == null) return;
    reactMessage.mutate(
      { messageId: msg.id, emoji },
      {
        onError: (err) => toast.error(err.message || "Falha ao reagir"),
      },
    );
  }

  // Fixar: toggle — clicar numa mensagem já fixada desafixa direto (igual
  // WhatsApp). Fixar uma NOVA abre o picker de duração (24h/7d/30d) antes
  // de confirmar. Várias podem ficar fixadas ao mesmo tempo (máx. 3).
  async function handlePinMessage(msg: { id: string; isPinnedMessage?: boolean }) {
    if (!conversationApiId) return;
    if (msg.isPinnedMessage) {
      unpinMessage.mutate(
        { messageId: msg.id },
        {
          onSuccess: () => toast.success("Mensagem desafixada"),
          onError: (err) => toast.error(err.message || "Falha ao desafixar"),
        },
      );
      return;
    }
    const durationHours = await requestPinDuration();
    if (durationHours == null) return;
    pinMessage.mutate(
      { messageId: msg.id, durationHours },
      {
        onSuccess: () => toast.success("Mensagem fixada"),
        onError: (err) => toast.error(err.message || "Falha ao fixar"),
      },
    );
  }

  function handleUnpinMessage(messageId: string) {
    if (!conversationApiId) return;
    unpinMessage.mutate(
      { messageId },
      { onError: (err) => toast.error(err.message || "Falha ao desafixar") },
    );
  }

  // Favoritar: marcador pessoal — sem `favorite` explícito, o backend
  // alterna o estado atual (evita round-trip extra pra saber o estado
  // prévio, que o front já tem local via `msg.isFavorited`).
  function handleFavoriteMessage(msg: { id: string; isFavorited?: boolean }) {
    favoriteMessageMutation.mutate(
      { messageId: msg.id, favorite: !msg.isFavorited },
      {
        onSuccess: (res) =>
          toast.success(res.favorited ? "Mensagem favoritada" : "Removida dos favoritos"),
        onError: (err) => toast.error(err.message || "Falha ao favoritar"),
      },
    );
  }

  // Reply (estilo WhatsApp): guarda a msg selecionada e o Composer mostra
  // a barra de preview. senderName é derivado (backend não retorna direto).
  const [replyTo, setReplyTo] = useState<{
    id: string;
    preview: string;
    senderName?: string | null;
  } | null>(null);

  function handleReplyMessage(message: BubbleMessage) {
    const preview = (message.content ?? "").slice(0, 120);
    const senderName =
      message.type === "incoming"
        ? contactName
        : message.senderName ?? "Você";
    setReplyTo({ id: message.id, preview, senderName });
  }
  const { features: convFeatures } = useConversationFeatures();

  function executeBulkResolve(extra?: {
    tabulationId?: string | null;
    skipAutomations?: boolean;
  }) {
    const pending = pendingBulkRef.current;
    const useAllInFilter = pending?.useAllInFilter ?? false;
    const ids = pending?.ids ?? [...selectedIds];
    if (!useAllInFilter && ids.length === 0) return;

    const count = useAllInFilter ? (filterTotal ?? ids.length) : ids.length;
    bulkAction.mutate(
      useAllInFilter
        ? {
            ids: [],
            action: "resolve",
            allInFilter: true,
            tab,
            search: "",
            filters: serverFilters as Record<string, unknown>,
            tabulationId: extra?.tabulationId,
            skipAutomations: extra?.skipAutomations,
          }
        : {
            ids,
            action: "resolve",
            tabulationId: extra?.tabulationId,
            skipAutomations: extra?.skipAutomations,
          },
      {
        onSuccess: (result) => {
          const skipped = Array.isArray(result?.skipped)
            ? result.skipped.length
            : 0;
          const closed = result?.updated ?? 0;
          setBulkTabulationOpen(false);
          setBulkConfirmOpen(false);
          pendingBulkRef.current = null;
          if (result?.operationId) {
            bulkKindRef.current = "resolve";
            bulkSkippedRef.current = skipped;
            setBulkOpId(result.operationId);
            const total = result.total ?? count;
            if (skipped > 0) {
              toast.warning(
                `Encerrando ${total} conversa${total > 1 ? "s" : ""} em segundo plano. ${skipped} exigem tabulação e não foram encerradas — encerre com uma tabulação.`,
                { id: `inbox-bulk-resolve-${result.operationId}` },
              );
            } else {
              toast.loading(
                `Encerrando ${total} conversa${total > 1 ? "s" : ""}…`,
                { id: `inbox-bulk-resolve-${result.operationId}` },
              );
            }
            exitSelectionMode();
            return;
          }
          if (closed > 0) {
            if (skipped > 0) {
              toast.warning(
                `${closed} encerrada(s). ${skipped} exigem tabulação e não foram encerradas — encerre com uma tabulação.`,
              );
            } else {
              toast.success(
                `${closed} conversa${closed > 1 ? "s" : ""} encerrada${closed > 1 ? "s" : ""}`,
              );
            }
            if (!useAllInFilter && ids.length > 0) {
              const closedSet = new Set(ids);
              qc.setQueriesData<{
                pages: { items: { id: string }[] }[];
                pageParams: unknown[];
              }>({ queryKey: ["inbox-conversations"] }, (old) => {
                if (!old?.pages) return old;
                return {
                  ...old,
                  pages: old.pages.map((page) => ({
                    ...page,
                    items: (page.items ?? []).filter((row) => !closedSet.has(row.id)),
                  })),
                };
              });
            }
            void refreshInboxQueue();
            exitSelectionMode();
            return;
          }
          if (skipped > 0) {
              toast.warning(
                `${skipped} conversa(s) exigem tabulação e não foram encerradas. Encerre com uma tabulação.`,
              );
          } else {
            toast.warning("Nenhuma conversa para encerrar.");
          }
          exitSelectionMode();
        },
      },
    );
  }

  function handleBulkAction(action: "resolve" | "reopen") {
    const ids = [...selectedIds];
    const useAllInFilter = selectAllFilter && action === "resolve";
    if (!useAllInFilter && ids.length === 0) return;

    if (action === "reopen") {
      bulkAction.mutate(
        { ids, action },
        {
          onSuccess: () => {
            toast.success(
              `${ids.length} conversa${ids.length > 1 ? "s" : ""} reaberta${ids.length > 1 ? "s" : ""}`,
            );
            setTab((current) => (current === "finalizados" ? "todos" : current));
            exitSelectionMode();
          },
        },
      );
      return;
    }

    pendingBulkRef.current = { useAllInFilter, ids };
    const picked = pickBulkCloseDepartment(displayRows, selectedIds, {
      allInFilter: useAllInFilter,
    });
    if (picked.departmentId) {
      setBulkTabulationDeptId(picked.departmentId);
      setBulkTabulationOpen(true);
      return;
    }
    if (canSkipAutomations) {
      setBulkConfirmOpen(true);
      return;
    }
    executeBulkResolve();
  }

  // ── Polling do encerramento em massa (leads-worker) ─────────────
  const qc = useQueryClient();

  // Alinha o card da lista com a sessão do chat (GET messages = contact+canal).
  // Ticket só-template / lastInbound denormalizado stale ficava sem "Expirada"
  // no card enquanto o composer já bloqueava envio.
  useEffect(() => {
    if (!activeId || !sessionInfo) return;
    const nextInbound = sessionInfo.lastInboundAt ?? null;
    qc.setQueriesData<{
      pages: { items: { id: string; lastInboundAt: string | null }[] }[];
      pageParams: unknown[];
    }>({ queryKey: ["inbox-conversations"] }, (old) => {
      if (!old?.pages) return old;
      let changed = false;
      const pages = old.pages.map((page) => {
        const items = (page.items ?? []).map((row) => {
          if (row.id !== conversationApiId && !matchesConversationUrlRef(row, activeId)) return row;
          const prev = row.lastInboundAt ?? null;
          if (prev === nextInbound) return row;
          changed = true;
          return { ...row, lastInboundAt: nextInbound };
        });
        return { ...page, items };
      });
      return changed ? { ...old, pages } : old;
    });
  }, [activeId, conversationApiId, sessionInfo, sessionInfo?.lastInboundAt, sessionInfo?.active, qc]);

  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const refreshInboxQueue = async () => {
    if (inboxRefreshing) return;
    setInboxRefreshing(true);
    try {
      await Promise.all([
        qc.refetchQueries({ queryKey: ["inbox-conversations"] }),
        qc.refetchQueries({ queryKey: ["conversations", "tab-counts"] }),
      ]);
    } finally {
      setInboxRefreshing(false);
    }
  };
  const bulkOp = useBulkOperation(bulkOpId);
  const bulkOpStatus = bulkOp.data?.status;
  useEffect(() => {
    if (!bulkOpId || !isBulkOperationFinished(bulkOpStatus)) return;
    const d = bulkOp.data;
    if (d) {
      const kind = bulkKindRef.current;
      const toastId =
        kind === "resolve"
          ? `inbox-bulk-resolve-${bulkOpId}`
          : `inbox-bulk-assign-${bulkOpId}`;
      const skipped = bulkSkippedRef.current;
      const doneVerb =
        kind === "unassign"
          ? "sem responsável"
          : kind === "assign"
            ? "reatribuída"
            : "encerrada";
      const doneVerbPlural =
        kind === "unassign"
          ? "sem responsável"
          : kind === "assign"
            ? "reatribuídas"
            : "encerradas";
      if (bulkOpStatus === "COMPLETED") {
        if (kind === "resolve" && skipped > 0) {
          toast.warning(
            `${d.succeeded} encerrada(s). ${skipped} exigem tabulação e não foram encerradas — encerre com uma tabulação.`,
            { id: toastId },
          );
        } else {
          toast.success(
            `${d.succeeded} conversa${d.succeeded > 1 ? "s" : ""} ${
              d.succeeded > 1 ? doneVerbPlural : doneVerb
            }`,
            { id: toastId },
          );
        }
      } else if (bulkOpStatus === "PARTIAL") {
        toast.warning(
          kind === "resolve" && skipped > 0
            ? `${d.succeeded} encerrada(s), ${d.failed} falharam. ${skipped} exigem tabulação — encerre com uma tabulação.`
            : `${d.succeeded} ${doneVerbPlural}, ${d.failed} falharam`,
          { id: toastId },
        );
      } else if (bulkOpStatus === "FAILED") {
        toast.error(
          kind === "resolve"
            ? "Falha ao encerrar as conversas em massa."
            : "Falha ao reatribuir as conversas em massa.",
          { id: toastId },
        );
      }
    }
    void qc.refetchQueries({ queryKey: ["inbox-conversations"] });
    void qc.refetchQueries({ queryKey: ["conversations", "tab-counts"] });
    qc.invalidateQueries({ queryKey: ["distribution-responsibles"] });
    qc.invalidateQueries({ queryKey: ["distribution-pending"] });
    setBulkOpId(null);
  }, [bulkOpId, bulkOpStatus, bulkOp.data, qc]);

  // Seletor de canal: lista de WhatsApps CONNECTED da org + estado
  // persistido por conversa. Quando a org tem 1 só canal, o widget não
  // aparece e o backend usa o canal "atual" da conversa (legacy).
  const { data: whatsappChannels } = useWhatsappChannels(isAuthenticated);
  const conversationChannelId = messagesData?.channel?.id ?? null;
  const lastMessageChannelId = useMemo(
    () => findLastPublicMessageChannelId(messagesData?.messages),
    [messagesData?.messages],
  );
  const { selectedChannelId, setSelectedChannelId } = useSelectedOutboundChannel(
    {
      conversationId: conversationApiId,
      conversationChannelId,
      availableChannels: whatsappChannels,
      lastMessageChannelId,
    },
  );
  const selectedOutbound = whatsappChannels?.find((c) => c.id === selectedChannelId);
  const applyWhatsappSession = usesWhatsapp24hWindow(
    selectedOutbound?.type ?? messagesData?.channel?.type,
  );

  // Override de canal ativo: revalida a janela de 24h no canal de DESTINO
  // (o `session` do GET messages reflete só o canal da conversa).
  const channelOverrideActive =
    !!selectedChannelId &&
    !!conversationChannelId &&
    selectedChannelId !== conversationChannelId;
  // Sempre a sessão do número escolhido no composer. Sem isso, inbound no
  // Acadêmico vira o channelId do ticket e o CSV (persistido) aparece
  // "24h encerrada" mesmo com janela aberta naquele chip.
  const { data: selectedSession, isFetched: selectedSessionFetched } =
    useChannelSession(
      conversationApiId,
      selectedChannelId,
      applyWhatsappSession && channelOverrideActive,
    );

  function handleSelect(id: string) {
    if (pinnedFromSearch && pinnedFromSearch.id !== id) setPinnedFromSearch(null);
    if (id === activeId) return;
    setActiveId(id);
    markRead.mutate(id);
    setReplyTo(null);
  }

  function handlePickSearchConversation(row: ConversationListRow) {
    setPinnedFromSearch(row);
    setStickyRow(row);
    const queue = pickVisibleInboxTab(inboxQueueTabFor(row), visibleTabs);
    if (queue && queue !== tab) setTab(queue);
    if (row.id !== activeId) {
      setActiveId(row.id);
      markRead.mutate(row.id);
      setReplyTo(null);
    }
    setSearchInput("");
    setMobilePaneTab("chat");
  }

  function handlePickSearchDeal(id: string) {
    setSearchInput("");
    void qc.prefetchQuery({
      queryKey: dealDetailKey(id),
      queryFn: () => getDeal(id),
      staleTime: 30_000,
    });
    router.push(`/pipeline?deal=${encodeURIComponent(id)}`);
  }

  async function handleSend(value: string) {
    if (!conversationApiId) return;
    try {
      const data = await sendMessage.mutateAsync({
        content: value,
        ...(replyTo ? { replyToId: replyTo.id } : {}),
        // Só envia override quando o canal escolhido difere do canal
        // atual da conversa — caminho rápido no backend (sem round-trip
        // extra de validação) e nenhum efeito visível pro agente que
        // não trocou de canal.
        ...(selectedChannelId && selectedChannelId !== conversationChannelId
          ? { channelId: selectedChannelId }
          : {}),
      });
      setDraft("");
      setReplyTo(null);
      // Conversa estava encerrada e o envio reabriu como NOVO ticket:
      // troca o chat ativo para o id novo (regra "reabrir = novo id").
      if (data.reopenedConversationId) {
        handleReopenNewConversation(data.reopenedConversationId);
      }
    } catch (err) {
      // Corrida: a sessão de 24h expirou enquanto o agente digitava (o
      // backend bloqueia com 409 antes de criar a mensagem). Em vez do
      // toast genérico, mostra o aviso de sessão e abre o fluxo de template.
      if (isSessionClosedError(err)) {
        toast.error(SESSION_CLOSED_TOAST, {
          action: { label: "Usar Template", onClick: () => setTemplateOpen(true) },
        });
        setTemplateOpen(true);
      } else {
        toast.error((err as Error)?.message || "Falha ao enviar");
      }
      throw err;
    }
  }

  function handleSendNote(value: string) {
    if (!conversationApiId) return;
    sendMessage.mutate(
      { content: value, asNote: true },
      {
        onSuccess: () => setDraft(""),
        onError: (err) => toast.error(err.message || "Falha ao salvar nota"),
      },
    );
  }

  // ── Adapters → tipos do v0 ─────────────────────────────────────
  const conversationCards = useMemo(
    () =>
      displayRows
        .filter(Boolean)
        .map((r) => toConversationCard(r, { active: matchesConversationUrlRef(r, activeId) })),
    [displayRows, activeId],
  );
  const contactName = activeRow?.contact?.name ?? "";
  const pinnedMessageIds = useMemo(
    () => messagesData?.pinnedMessageIds ?? [],
    [messagesData?.pinnedMessageIds],
  );
  const pinnedIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const messageBubbles = useMemo(
    () =>
      messages.map((m) => {
        const bubble = toMessageBubble(m, contactName);
        return pinnedIdSet.has(m.id) ? { ...bubble, isPinnedMessage: true } : bubble;
      }),
    [messages, contactName, pinnedIdSet],
  );
  // Previews do banner "fixadas" (várias, estilo WhatsApp) — derivados do
  // próprio array já carregado, na ordem em que o backend os retorna.
  const pinnedMessagesPreview = useMemo(() => {
    return pinnedMessageIds
      .map((pid) => messageBubbles.find((m) => m.id === pid))
      .filter((m): m is NonNullable<typeof m> => !!m)
      .map((m) => ({ id: m.id, content: m.content, senderName: m.senderName ?? null }));
  }, [pinnedMessageIds, messageBubbles]);
  const chatContact = activeRow ? toChatContact(activeRow) : null;
  // Backend é source of truth quando disponível (`session.active`).
  // Fallback: thread visível (inbound do cliente reabre na hora — o cache
  // `channel-session` não acompanhava o SSE) e, sem `session`, lastInboundAt.
  const sessionActiveFromBackend = sessionInfo?.active;
  const threadLastInboundAt = lastInboundAtFromThread(
    messages,
    selectedChannelId,
    { strictChannel: channelOverrideActive },
  );
  const sessionExpiredEffective = isWhatsappComposerSessionExpired({
    applyWhatsappSession,
    messagesLoaded: Boolean(activeRow && messagesData),
    channelOverrideActive,
    selectedSessionFetched,
    selectedSessionActive: selectedSession?.active,
    messagesSessionActive: sessionActiveFromBackend,
    messagesLastInboundAt:
      sessionInfo?.lastInboundAt ?? activeRow?.lastInboundAt ?? null,
    threadLastInboundAt,
  });
  // Bloco C (25/jun/26): backend pode setar `canReply:false` quando o
  // usuário não tem `channel.send`. Default true preserva compat com
  // backend antigo (que não envia o campo).
  const canReply = messagesData?.canReply ?? true;
  const composerDisabled = !canReply || sessionExpiredEffective;
  const composerPlaceholder = !canReply
    ? "Você não tem permissão para enviar mensagens neste canal."
    : undefined;
  const contactAsideView = activeRow
    ? toContactAside(contactDetail, activeRow, messagesData?.channel ?? null)
    : null;

  // ── Stage pills no header do chat — placeholder até integrar com pipeline real
  // (Fase 9 conecta no /api/pipelines/:id/board e usa deriveStagePills).
  const stagePillsView = useMemo<
    { label: string; status: "done" | "active" | "pending" }[]
  >(() => [], []);

  const navRailNode = navRail ?? <NavRail />;

  // Com header de página, busca à direita no header (slot `center`); período nas actions.
  const searchInHeader = !!pageHeader;

  const inboxPeriodNode = (
    <InboxPeriodCalendar filters={filters} onChange={setFilters} />
  );

  const inboxSearchFilterNode = (
    <InboxSearchFilterBar
      search={searchInput}
      onSearch={setSearchInput}
      filters={filters}
      onChangeFilters={setFilters}
      onPickConversation={handlePickSearchConversation}
      onPickDeal={handlePickSearchDeal}
    />
  );

  // Variante compacta para a barra mobile (Voltar | busca | Chat/Negócio).
  // Instância separada — estado de busca/filtros vive no pai; não montar
  // junto com `inboxSearchFilterNode` na mesma branch visual.
  const compactInboxSearchFilterNode = (
    <InboxSearchFilterBar
      search={searchInput}
      onSearch={setSearchInput}
      filters={filters}
      onChangeFilters={setFilters}
      onPickConversation={handlePickSearchConversation}
      onPickDeal={handlePickSearchDeal}
      placeholder="Buscar..."
      className={cn(
        "min-w-0",
        "[&_input]:h-8 [&_input]:pl-7 [&_input]:pr-8 [&_input]:text-[10px] [&_input]:leading-none [&_input]:shadow-none",
        "[&>svg]:left-2 [&>svg]:size-[13px]",
        // w-auto libera espaço para o badge de contagem de filtros ativos
        "[&_button]:right-0.5 [&_button]:h-6 [&_button]:min-w-6 [&_button]:w-auto [&_button]:gap-0 [&_button]:px-1",
        "[&_button_svg]:size-[13px]",
      )}
    />
  );

  // Aviso sonoro por mensagem recebida — o botão só (des)liga a preferência
  // (persistida no localStorage). O ping em si toca no useInboxRealtime.
  const [soundMuted, setSoundMuted] = useInboxSoundMuted();
  const columnMoreMenuNode = (
    <DropdownGlass
      matchTriggerWidth={false}
      className="min-w-[220px]"
      align="end"
      options={[
        {
          value: "sound",
          label: "Notificações",
          icon: soundMuted ? <IconBellOff size={15} /> : <IconBell size={15} />,
          trailing: !soundMuted ? (
            <IconCircleCheck size={15} className="text-[var(--brand-primary)]" />
          ) : undefined,
        },
        {
          value: "select",
          label: "Seleção de múltiplas",
          icon: <IconSquareCheck size={15} />,
          trailing: selectionMode ? (
            <IconCircleCheck size={15} className="text-[var(--brand-primary)]" />
          ) : undefined,
        },
      ]}
      onValueChange={(v) => {
        if (v === "sound") setSoundMuted(!soundMuted);
        if (v === "select") {
          if (selectionMode) exitSelectionMode();
          else setSelectionMode(true);
        }
      }}
      trigger={
        <button
          type="button"
          aria-label="Mais opções da lista"
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] transition-colors hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] data-[state=open]:border-[var(--brand-primary)] data-[state=open]:bg-[var(--brand-primary)] data-[state=open]:text-white"
        >
          <IconChevronDown size={16} stroke={2.4} />
        </button>
      }
    />
  );

  // Ações da barra de seleção — Encerrar/Reabrir/Reatribuir (protegidas por
  // permissão) + Cancelar (sempre visível). Reatribuir/remover responsável
  // usa POST /api/conversations/bulk (assign), inclusive "todas do filtro".
  const bulkActionsNode = (
    <div className="flex shrink-0 items-center gap-1.5 @max-[520px]:grid @max-[520px]:w-full @max-[520px]:grid-cols-2">
      {(selectedIds.size > 0 || selectAllFilter) && (
        <>
          <RequirePermission permission="conversation:resolve">
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              disabled={bulkAction.isPending}
              onClick={() => handleBulkAction("resolve")}
            >
              <IconCircleCheck size={14} />
              <span className="ml-1.5">Encerrar</span>
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              disabled={bulkAction.isPending}
              onClick={() => handleBulkAction("reopen")}
            >
              <IconRotateClockwise size={14} />
              <span className="ml-1.5">Reabrir</span>
            </ButtonGlass>
          </RequirePermission>
          {canBulkAssign && (
            <BulkReassignPopover
              conversationIds={[...selectedIds]}
              disabled={bulkAction.isPending}
              allInFilter={selectAllFilter}
              filterTotal={filterTotal}
              tab={tab}
              search=""
              filters={serverFilters as Record<string, unknown>}
              onQueued={(operationId, total, unassign) => {
                bulkKindRef.current = unassign ? "unassign" : "assign";
                setBulkOpId(operationId);
                toast.loading(
                  `${unassign ? "Removendo responsável de" : "Reatribuindo"} ${total.toLocaleString("pt-BR")} conversa${total > 1 ? "s" : ""}…`,
                  { id: `inbox-bulk-assign-${operationId}` },
                );
              }}
              onPersisted={(updated, skipped, unassign) => {
                if (updated > 0) {
                  const verb = unassign
                    ? "sem responsável"
                    : updated > 1
                      ? "reatribuídas"
                      : "reatribuída";
                  if (skipped > 0) {
                    toast.warning(
                      `${updated} conversa${updated > 1 ? "s" : ""} ${verb}. ${skipped} não puderam ser ${unassign ? "liberadas" : "reatribuídas"}.`,
                    );
                  } else {
                    toast.success(
                      `${updated} conversa${updated > 1 ? "s" : ""} ${verb}`,
                    );
                  }
                  void refreshInboxQueue();
                  return;
                }
                if (skipped > 0) {
                  toast.warning(
                    unassign
                      ? "Nenhuma conversa pôde ter o responsável removido."
                      : "Nenhuma conversa pôde ser reatribuída.",
                  );
                  return;
                }
                toast.warning(
                  unassign
                    ? "Nenhuma conversa para remover responsável."
                    : "Nenhuma conversa para reatribuir.",
                );
              }}
              onDone={exitSelectionMode}
            />
          )}
        </>
      )}
      <ButtonGlass type="button" variant="glass" size="sm" onClick={exitSelectionMode}>
        Cancelar
      </ButtonGlass>
    </div>
  );

  const conversationColumnNode = (
    <ConversationColumn
      conversations={conversationCards}
      activeConversationId={
        foundActiveRow?.id ?? stickyRow?.id ?? activeId ?? undefined
      }
      onSelectConversation={handleSelect}
      searchValue={searchInput}
      onSearchChange={setSearchInput}
      hideSearch={searchInHeader}
      scrollToTopKey={pinnedFromSearch?.id}
      // Sem PageHeader, o filtro permanece ao lado do status. No Inbox ele
      // sobe junto da busca, como botão irmão (fora do input).
      filterSlot={
        <>
          {columnMoreMenuNode}
          {!searchInHeader && (
            <InboxFilterButton value={filters} onChange={setFilters} />
          )}
          {confirmDialogNode}
          <TabulationDialog
            open={bulkTabulationOpen}
            onOpenChange={(open) => {
              setBulkTabulationOpen(open);
              if (!open) pendingBulkRef.current = null;
            }}
            departmentId={bulkTabulationDeptId}
            submitting={bulkAction.isPending}
            allowSkipAutomations={canSkipAutomations}
            onConfirm={(tabulationId, extra) => {
              executeBulkResolve({
                tabulationId,
                skipAutomations:
                  canSkipAutomations && extra?.skipAutomations ? true : undefined,
              });
            }}
          />
          <ResolveConfirmDialog
            open={bulkConfirmOpen}
            onOpenChange={(open) => {
              setBulkConfirmOpen(open);
              if (!open) pendingBulkRef.current = null;
            }}
            submitting={bulkAction.isPending}
            onConfirm={(skipAutomations) =>
              executeBulkResolve({
                skipAutomations:
                  canSkipAutomations && skipAutomations ? true : undefined,
              })
            }
          />
        </>
      }
      selectionMode={selectionMode}
      selectedIds={selectedIds}
      onToggleSelectOne={toggleSelectOne}
      onSelectAllChange={(ids) => {
        setSelectAllFilter(false);
        setSelectedIds(new Set(ids));
      }}
      totalCount={filterTotal}
      selectAllFilter={selectAllFilter}
      onSelectAllFilterChange={(v) => {
        setSelectAllFilter(v);
        // Ao ativar, marca todas as carregadas (mantém o master check ✓).
        if (v) setSelectedIds(new Set(conversationCards.map((c) => c.id)));
      }}
      bulkActionsSlot={bulkActionsNode}
      tabsOverride={visibleTabs.map((t) => {
        const count = listBootstrapping
          ? undefined
          : tabCounts?.[t.id];
        return {
          label: t.label,
          count,
          title: t.title,
        };
      })}
      activeTabIndex={visibleTabs.findIndex((t) => t.id === tab)}
      onTabChange={(idx) => {
        const next = visibleTabs[idx]?.id;
        if (next) setTab(next);
      }}
      onRefresh={() => {
        void refreshInboxQueue();
      }}
      isRefreshing={inboxRefreshing}
      resizerSlot={
        isDesktop ? (
          <ColumnResizer
            value={convWidth}
            onChange={setConvWidth}
            min={200}
            max={400}
          />
        ) : undefined
      }
      onLoadMore={handleLoadMore}
      hasMore={hasNextPage && !isPlaceholderData}
      isLoadingMore={isFetchingNextPage}
      isLoading={listBootstrapping}
      className="h-full min-h-0"
      renderCardSlots={(c) => ({
        assigneeSlot: (
          <RequirePermission
            permission="conversation:reassign_others"
            fallback={
              <AssigneePopover
                conversationId={c.id}
                currentAssigneeName={c.assignee}
                currentAssigneeId={c.assigneeId ?? null}
                currentAssigneeImageUrl={c.assigneeAvatarUrl ?? null}
                disabled
              />
            }
          >
            <AssigneePopover
              conversationId={c.id}
              currentAssigneeName={c.assignee}
              currentAssigneeId={c.assigneeId ?? null}
              currentAssigneeImageUrl={c.assigneeAvatarUrl ?? null}
            />
          </RequirePermission>
        ),
      })}
    />
  );

  // Tags da conversa ativa — até 2 chips + "+N" para o restante.
  const activeTags = activeRow?.tags ?? [];
  const MAX_ASIDE_TAGS = 2;

  // Node de tags: chips visuais + popover de gerenciamento
  const tagsNode = (
    <div className="flex flex-wrap items-center gap-1.5">
      {activeTags.slice(0, MAX_ASIDE_TAGS).map((t) => {
        const hex = t.color ?? null;
        const clean = (hex ?? "").replace("#", "");
        const r = parseInt(clean.slice(0, 2), 16);
        const g = parseInt(clean.slice(2, 4), 16);
        const b = parseInt(clean.slice(4, 6), 16);
        const valid = hex && ![r, g, b].some(Number.isNaN);
        const bg = valid ? `rgba(${r},${g},${b},0.14)` : "var(--color-enterprise-bg)";
        const fg = valid
          ? `rgb(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)})`
          : "var(--brand-primary)";
        const border = valid ? `rgba(${r},${g},${b},0.30)` : "rgba(91,111,245,0.25)";
        return (
          <TooltipGlass key={t.id} label={t.name} side="top">
            <span
              className="inline-flex shrink-0 items-center rounded-full border px-2 py-px font-display text-[10.5px] font-semibold whitespace-nowrap"
              style={{ background: bg, color: fg, borderColor: border }}
            >
              {t.name}
            </span>
          </TooltipGlass>
        );
      })}
      {activeTags.length > MAX_ASIDE_TAGS && (
        <TooltipGlass label={activeTags.slice(MAX_ASIDE_TAGS).map((t) => t.name).join(", ")} side="top">
          <span className="inline-flex shrink-0 items-center rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-1.5 py-px font-display text-[10.5px] font-bold text-[var(--text-secondary)]">
            +{activeTags.length - MAX_ASIDE_TAGS}
          </span>
        </TooltipGlass>
      )}
      <TagsPopover
        conversationId={conversationApiId}
        currentTags={activeTags}
      />
    </div>
  );

  // ── Funil do primeiro deal ──────────────────────────────────────
  // pipelineId já vem achatado no GET contact (?view=inbox). Não espera
  // useDealDetail nem carrega o board completo (~150KB) — só stages via
  // GET /api/pipelines (~3KB, staleTime 5min).
  const firstDeal = contactAsideView?.deals?.[0] ?? null;
  const firstDealId = firstDeal?.id ?? null;
  const { data: firstDealDetail } = useDealDetail(firstDealId);
  const dealStage = (
    firstDealDetail as
      | { stage?: { id?: string; pipeline?: { id?: string; name?: string } } }
      | undefined
  )?.stage;
  const firstDealPipelineId =
    firstDeal?.pipelineId ?? dealStage?.pipeline?.id ?? null;
  const firstDealPipelineName =
    firstDeal?.pipelineName ?? dealStage?.pipeline?.name ?? null;
  const { data: pipelinesLite } = usePipelines(
    isAuthenticated && !!firstDealPipelineId,
  );
  const boardStages: PipelineListStageDto[] = useMemo(() => {
    if (!firstDealPipelineId || !pipelinesLite) return [];
    const pipe = pipelinesLite.find((p) => p.id === firstDealPipelineId);
    return pipe?.stages ?? [];
  }, [pipelinesLite, firstDealPipelineId]);

  // Monta funnelSegments e stageDropdownSlot para o primeiro deal.
  // Os demais deals ficam com fallback (sem barra + stageName estático).
  const firstDealFunnelSegments = boardStages.map((s) => ({
    id: s.id,
    name: s.name,
    color: s.color ?? "var(--brand-primary)",
    position: s.position,
  }));
  const firstDealStageId = firstDeal?.stageId ?? dealStage?.id ?? null;
  const firstDealStageName =
    boardStages.find((s) => s.id === firstDealStageId)?.name ??
    firstDeal?.stageName ??
    null;

  // Injeta funnelSegments + stageDropdownSlot + assigneeSlot apenas no primeiro deal.
  const dealsWithSlots = (contactAsideView?.deals ?? []).map((d, idx) => {
    if (idx !== 0) return d;
    const dealOwnerSlot = firstDealId ? (
        <DealOwnerPopover
          dealId={firstDealId}
          currentOwnerId={firstDealDetail?.owner?.id ?? null}
          currentOwnerName={firstDealDetail?.owner?.name ?? null}
          pipelineId={firstDealPipelineId}
          conversationId={conversationApiId}
          conversationAssigneeId={activeRow?.assignedTo?.id ?? null}
          askTransferConversation={async ({ newOwnerId, newOwnerName }) => {
            const name = newOwnerName.trim() || "este responsável";
            if (newOwnerId) {
              return confirmDialog({
                title: "Transferir a conversa também?",
                description: `O responsável do negócio será ${name}. Transferir também a conversa para ${name}?`,
                confirmLabel: "Sim, transferir conversa",
                cancelLabel: "Só o negócio",
              });
            }
            return confirmDialog({
              title: "Remover da conversa também?",
              description:
                "O negócio ficará sem responsável. Remover também o responsável da conversa?",
              confirmLabel: "Sim, remover da conversa",
              cancelLabel: "Só o negócio",
            });
          }}
          onTransferConversation={async (assignedToId) => {
            if (!conversationApiId) return;
            await postConversationAction(conversationApiId, {
              action: "assign",
              assignedToId,
            });
          }}
          trigger={
            firstDealDetail?.owner?.name ? (
              <span
                className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] py-px pl-px pr-2 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--glass-bg-base)]"
                title={firstDealDetail.owner.name}
              >
                <UserAvatar
                  name={firstDealDetail.owner.name}
                  imageUrl={firstDealDetail.owner.avatarUrl ?? null}
                  size={20}
                />
                <span className="min-w-0 truncate font-display text-[10.5px] font-semibold text-[var(--text-secondary)]">
                  {firstDealDetail.owner.name}
                </span>
              </span>
            ) : (
              <span className="inline-flex cursor-pointer items-center rounded-full bg-white px-2.5 py-1 font-display text-[10.5px] font-semibold text-[#2e3b6e] shadow-sm">
                +Responsável
              </span>
            )
          }
        />
      ) : undefined;

    return {
      ...d,
      ...(boardStages.length
        ? {
            stageId: firstDealStageId ?? d.stageId,
            stageName: firstDealStageName ?? d.stageName,
            pipelineName: firstDealPipelineName ?? d.pipelineName,
            funnelSegments: firstDealFunnelSegments,
            stageDropdownSlot:
              firstDealId && firstDealStageId ? (
                <StagePicker
                  dealId={firstDealId}
                  currentStageId={firstDealStageId}
                  pipelineId={firstDealPipelineId}
                >
                  {({ onSelectStage, isPending, canMove }) => (
                    <InboxStageDropdown
                      stages={boardStages}
                      currentStageId={firstDealStageId}
                      currentPipelineId={firstDealPipelineId}
                      isPending={isPending}
                      canMove={canMove}
                      onSelect={onSelectStage}
                    />
                  )}
                </StagePicker>
              ) : undefined,
          }
        : {}),
      assigneeSlot: dealOwnerSlot,
      dealTagsNode: (
        <DealTagsTray
          dealId={d.id}
          currentTags={(firstDealDetail as { tags?: { id: string; name: string; color: string | null }[] } | undefined)?.tags ?? []}
        />
      ),
    };
  });

  const contactAsideViewWithSlots = contactAsideView
    ? { ...contactAsideView, deals: dealsWithSlots }
    : null;

  // ── Slots das abas do card da conversa ──────────────────────────
  // Notas/Timeline/Tarefas sao escopados ao 1o negocio do contato
  // (mesmo padrao do DealDetailPanel). Sem negocio vinculado, mostra
  // um placeholder amigavel.
  const dealNotes =
    (firstDealDetail as { notes?: string | null } | undefined)?.notes ?? null;
  const notesSlot = firstDealId ? (
    <DealNotesTab
      dealId={firstDealId}
      notes={dealNotes}
      pipelineId={firstDealPipelineId}
    />
  ) : (
    <NoDealTab message="Vincule um negocio a este contato para registrar notas." />
  );
  // Timeline da CONVERSA (nao do deal) — sempre disponivel quando ha
  // conversa ativa, mesmo sem deal vinculado. Ver AGENT.md "ID de
  // conversa + logs + gatilho".
  const timelineSlot = activeId ? (
    <ConversationTimelineTab conversationId={conversationApiId} />
  ) : (
    <NoDealTab message="Selecione uma conversa para ver a timeline." />
  );
  const activitiesSlot = firstDealId ? (
    <div className="flex-1 overflow-auto">
      <ActivitiesPanel
        dealId={firstDealId}
        contactId={activeContactId}
        contactName={
          contactAsideView?.name ?? activeRow?.contact?.name ?? null
        }
        dealTitle={firstDeal?.title ?? null}
      />
    </div>
  ) : (
    <NoDealTab message="Vincule um negocio a este contato para registrar tarefas." />
  );
  // IB8: aba "Chamadas" no topo do inbox, igual ao DealDetailPanel. Lista
  // os logs de telefonia do contato ativo. Usamos `activeContactId` (nao
  // o dealId) porque o historico de chamadas e' por contato.
  const callsSlot = activeContactId ? (
    <div className="flex-1 overflow-auto p-4">
      <CallHistoryList embedded contactId={activeContactId} />
    </div>
  ) : null;

  const chatNode =
    chatContact && activeRow ? (
      <ChatArea
        contact={chatContact}
        messages={messageBubbles}
        stages={stagePillsView}
        showSessionAlert={sessionExpiredEffective}
        connection={messagesData?.channel ?? null}
        connections={messagesData?.channels}
        conversationNumber={activeRow?.number ?? null}
        conversationId={activeRow.id}
        onLoadOlder={fetchOlder}
        hasOlder={hasOlder}
        hasOlderTickets={hasOlderTickets}
        isLoadingOlder={isFetchingOlder}
        messagesLoading={messagesPending && !messagesData}
        messagesError={messagesFailed && !messagesData}
        conversationResolved={activeRow?.status === "RESOLVED"}
        conversationClosedAt={activeRow?.closedAt ?? null}
        onUseTemplate={() => setTemplateOpen(true)}
        onReactMessage={handleReactMessage}
        onPinMessage={handlePinMessage}
        onFavoriteMessage={handleFavoriteMessage}
        pinnedMessages={pinnedMessagesPreview}
        onUnpinMessage={handleUnpinMessage}
        onReplyMessage={handleReplyMessage}
        headerActionsSlot={
          <>
            <WhatsappCallChip
              conversationId={activeRow.id}
              channel={activeRow.channel}
              variant="cta"
              hasCalling={tab === "ligar" || conversationHasCallingHint(activeRow)}
              contactName={
                contactAsideView?.name ?? activeRow.contact?.name ?? null
              }
            />
            <ConversationActionsMenu
              conversationId={conversationApiId}
              conversationNumber={activeRow?.number}
              contactId={activeContactId}
              isResolved={activeRow.status === "RESOLVED"}
              assigneeId={activeRow.assignedTo?.id ?? null}
              assigneeType={activeRow.assignedTo?.type ?? null}
              blockReturnToAi={(contactAsideView?.deals ?? []).some((d) =>
                /acolh/i.test(
                  `${d.pipelineName ?? ""} ${d.stageName ?? ""} ${firstDealPipelineName ?? ""} ${firstDealStageName ?? ""}`,
                ),
              )}
              onOpenFavorites={() => setFavoritesOpen(true)}
              onReopenNewConversation={handleReopenNewConversation}
              onResolved={(id) => {
                setStickyRow((prev) =>
                  prev?.id === id
                    ? {
                        ...prev,
                        status: "RESOLVED",
                        closedAt: new Date().toISOString(),
                      }
                    : prev,
                );
              }}
              departmentId={activeRow.departmentId ?? activeRow.department?.id ?? null}
              requireTabulationOnClose={
                activeRow.department?.requireTabulationOnClose ?? false
              }
              onDepartmentChanged={(dept) => {
                setStickyRow((prev) =>
                  prev
                    ? {
                        ...prev,
                        departmentId: dept.id,
                        department: {
                          id: dept.id,
                          name: dept.name,
                          requireTabulationOnClose: dept.requireTabulationOnClose,
                        },
                      }
                    : prev,
                );
              }}
            />
          </>
        }
        composerSlot={
          <Composer
            conversationId={conversationApiId}
            value={draft}
            onChange={setDraft}
            onSend={handleSend}
            onSendNote={handleSendNote}
            sending={sendMessage.isPending}
            disabled={composerDisabled}
            placeholder={composerPlaceholder}
            isResolved={activeRow.status === "RESOLVED"}
            contactId={activeContactId}
            contactName={
              contactAsideView?.name ??
              activeRow.contact?.name ??
              null
            }
            dealId={firstDealId}
            dealTitle={firstDeal?.title ?? null}
            deals={(contactAsideView?.deals ?? []).map((d) => ({
              id: d.id,
              title: d.title,
            }))}
            externalTemplate={externalTemplate}
            onExternalTemplateConsumed={() => setExternalTemplate(null)}
            onRequestTemplate={() => setTemplateOpen(true)}
            sessionExpired={sessionExpiredEffective}
            signatureAllowed={convFeatures.agentSignatureEnabled}
            signatureEditable={convFeatures.agentSignatureEditable}
            availableChannels={whatsappChannels}
            selectedChannelId={selectedChannelId}
            conversationChannelId={conversationChannelId}
            lastMessageChannelId={lastMessageChannelId}
            onSelectChannel={setSelectedChannelId}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            departmentId={activeRow.departmentId ?? activeRow.department?.id ?? null}
            requireTabulationOnClose={
              activeRow.department?.requireTabulationOnClose ?? false
            }
            onReopenNewConversation={handleReopenNewConversation}
            onResolved={(id) => {
              setStickyRow((prev) =>
                prev?.id === id
                  ? {
                      ...prev,
                      status: "RESOLVED",
                      closedAt: new Date().toISOString(),
                    }
                  : prev,
              );
            }}
            conversationNumber={activeRow?.number ?? null}
            enableCallPermission={
              activeRow.channel === "whatsapp" || activeRow.channel === "meta"
            }
            transferSlot={
              <RequirePermission permission="conversation:transfer">
                <TransferPopover
                  variant="composer"
                  conversationId={conversationApiId}
                  currentAssigneeId={activeRow.assignedTo?.id ?? null}
                  currentDepartmentId={
                    activeRow.departmentId ?? activeRow.department?.id ?? null
                  }
                />
              </RequirePermission>
            }
          />
        }
        floatingCallSlot={
          <DealCallButton
            fab
            dealId={firstDealId}
            phone={chatContact?.phone || null}
            contactId={activeContactId ?? undefined}
          />
        }
        notesSlot={notesSlot}
        activitiesSlot={activitiesSlot}
        timelineSlot={timelineSlot}
        callsSlot={callsSlot}
      />
    ) : (
      <EmptyChatArea />
    );

  const asideNode =
    contactAsideViewWithSlots && activeRow ? (
      <ContactAside
        contact={contactAsideViewWithSlots}
        headerActionsNode={undefined}
        tagsNode={tagsNode}
        contactTagsNode={
          // IB7: tags do CONTATO (mesmo padrao das tags de negocio) —
          // mostra 2 mais recentes + `+N` com tooltip pro resto + popover
          // pra adicionar/remover.
          activeContactId ? (
            <ContactTagsTray
              contactId={activeContactId}
              /* Backend (getContactById) devolve tags como TagOnContact[]
                 = { contactId, tagId, tag: { id, name, color } }[]. Já a
                 rota de list (getContacts) achata pra { id, name, color }[].
                 Como ContactTagsTray/Popover esperam o shape achatado,
                 normalizamos aqui — assim as pills ganham cor e label
                 corretos (antes ficavam vazias). */
              currentTags={(contactDetail?.tags ?? []).map((t) =>
                (t as unknown as { tag?: { id: string; name: string; color: string | null } }).tag
                  ?? (t as unknown as { id: string; name: string; color: string | null })
              )}
            />
          ) : null
        }
        collapsed={effectiveAsideCollapsed}
        onToggleCollapse={() => setAsideCollapsed((v) => !v)}
        contactFieldConfigSlot={
          <RequirePermission permission="settings:custom_fields">
            <FieldConfigPanel entities={["contact"]} context="inbox_lead_v2" />
          </RequirePermission>
        }
        dealFieldConfigSlot={
          <RequirePermission permission="settings:custom_fields">
            <FieldConfigPanel entities={["deal"]} context="inbox_lead_v2" />
          </RequirePermission>
        }
      />
    ) : (
      <EmptyAside />
    );

  const templateModalNode = (
    <WhatsappTemplatePickerModal
      open={templateOpen}
      onClose={() => setTemplateOpen(false)}
      conversationId={conversationApiId}
      channelId={selectedChannelId}
      contactName={contactName || null}
      onPick={(tpl) => {
        setExternalTemplate(whatsappTemplateToPending(tpl));
        setTemplateOpen(false);
      }}
    />
  );

  // Picker de duração do "Fixar" (24h/7d/30d) + painel "Mensagens
  // favoritas" — self-contained, plugados nos 4 pontos de retorno
  // (mobile/desktop × com/sem pageHeader) junto do templateModalNode.
  const extraDialogsNode = (
    <>
      {pinDurationDialog}
      <FavoritesPanel
        open={favoritesOpen}
        onOpenChange={setFavoritesOpen}
        conversationId={conversationApiId}
      />
    </>
  );

  // Cabeçalho da página com colapso animado (slide up/down) — dá mais
  // altura ao chat/asides. Não renderiza toggle inline; o controle
  // fica integrado ao PageHeader (actions) ou flutua no canto sup.
  // direito quando colapsado.
  const renderCollapsiblePageHeader = (headerNode: React.ReactNode) => (
    <div
      className={cn(
        "grid shrink-0 overflow-hidden",
        // Só ligamos a transição APÓS a hidratação. Sem isso, quando o
        // usuário tinha `headerCollapsed=true` salvo, o SSR pintava o header
        // aberto e o `useLayoutEffect` flipava pra `true` logo depois — o
        // browser animava o fechamento em 300ms ("fantasma": header pisca
        // visível → colapsa animado → pill aparece). Com o gate, o estado
        // salvo é aplicado sem animação no primeiro paint pós-hidratação.
        headerHydrated && "transition-[grid-template-rows,opacity] duration-300 ease-out",
        headerCollapsed
          ? "pointer-events-none grid-rows-[0fr] opacity-0"
          : "grid-rows-[1fr] opacity-100",
      )}
      aria-hidden={headerCollapsed}
    >
      <div className="min-h-0 overflow-hidden">{headerNode}</div>
    </div>
  );

  // Botão "ocultar cabeçalho" — vai dentro do slot `actions` do
  // PageHeader (extremo direito, ao lado dos demais controles).
  const collapseHeaderBtn = (
    <TooltipGlass label="Ocultar cabeçalho" side="bottom">
      <button
        type="button"
        onClick={(e) => {
          e.currentTarget.blur();
          setHeaderCollapsed(true);
        }}
        aria-label="Ocultar cabeçalho"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] backdrop-blur transition-all hover:bg-[var(--glass-bg-base)] hover:text-[var(--brand-primary)] active:scale-95"
      >
        <IconChevronsUp size={16} stroke={2.2} />
      </button>
    </TooltipGlass>
  );

  // Botão "mostrar cabeçalho" — pill circular no padrão da NavRailV2
  // (border-brand + bg branco + shadow + hover fills). Fica no CANTO
  // SUPERIOR DIREITO do outer grid (fora do container com overflow-hidden,
  // senão é cortado). Alinhado verticalmente com o pill da NavRail
  // (`top-6` = mesmo offset dela).
  // Gate em `headerHydrated`: o default é `headerCollapsed=false`, então
  // sem gate o pill nunca aparecia indevidamente — MAS, se por qualquer
  // razão o default virasse `true` ou o SSR divergisse do client, o pill
  // "fantasma" apareceria por 1 frame. Manter o gate garante que a
  // decisão de mostrar/esconder o pill nunca dependa de estado
  // pré-hidratação.
  const expandHeaderBtn = headerHydrated && headerCollapsed ? (
    <TooltipGlass label="Mostrar cabeçalho" side="left">
      <button
        type="button"
        onClick={() => setHeaderCollapsed(false)}
        aria-label="Mostrar cabeçalho"
        className="fixed right-6 top-6 z-50 flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--brand-primary)] bg-white text-[var(--brand-primary)] shadow-[0_2px_8px_rgba(15,23,42,0.25)] transition-all hover:scale-110 hover:bg-[var(--brand-primary)] hover:text-white"
      >
        <IconChevronsDown size={14} stroke={2.5} />
      </button>
    </TooltipGlass>
  ) : null;

  // Layout COM cabeçalho de página (estilo "Caixa de entrada" da
  // referência): NavRail fixo à esquerda; à direita o header no topo e
  // as 3 colunas (lista/chat/contato) numa grade abaixo.
  if (pageHeader) {
    // ── Mobile: layout de painel único (lista → chat/negócio) ──────
    if (!isDesktop) {
      return (
        <div className="v2-screen relative grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] overflow-hidden">
          {navRailNode}
          <div
            className={cn(
              "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
              headerCollapsed ? "gap-0" : "gap-4",
            )}
          >
            {renderCollapsiblePageHeader(
              <PageHeader
                icon={pageHeader.icon}
                title={pageHeader.title}
                center={activeId ? undefined : inboxSearchFilterNode}
                actions={activeId ? undefined : inboxPeriodNode}
              />,
            )}
            {!activeId ? (
              <div className="min-h-0 flex-1 overflow-hidden">
                {conversationColumnNode}
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {/* Barra compacta: Voltar | busca/filtro | Chat | Negócio */}
                <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-1.5">
                  <button
                    type="button"
                    onClick={closeActiveConversation}
                    className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
                  >
                    <IconArrowLeft size={14} stroke={2} />
                    Voltar
                  </button>
                  <div className="min-w-0 flex-1">
                    {compactInboxSearchFilterNode}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
                    <button
                      type="button"
                      onClick={() => setMobilePaneTab("chat")}
                      className={cn(
                        "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                        mobilePaneTab === "chat"
                          ? "bg-[var(--brand-primary)] text-white shadow-sm"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <IconMessageCircle size={13} stroke={2} />
                      Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setMobilePaneTab("negocio")}
                      className={cn(
                        "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                        mobilePaneTab === "negocio"
                          ? "bg-[var(--brand-primary)] text-white shadow-sm"
                          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      <IconBriefcase size={13} stroke={2} />
                      Negócio
                    </button>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  {mobilePaneTab === "chat" ? chatNode : asideNode}
                </div>
              </div>
            )}
          </div>
          {expandHeaderBtn}
          {templateModalNode}
          {extraDialogsNode}
        </div>
      );
    }

    // ── Desktop: layout original de 3 colunas ─────────────────────
    return (
      <div
        className="v2-screen relative grid h-full min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: "var(--nav-rail-w, 72px) minmax(0, 1fr)",
          gridTemplateRows: "minmax(0, 1fr)",
        }}
      >
        {navRailNode}
        <div
          className={cn(
            "relative flex min-h-0 min-w-0 flex-col overflow-hidden",
            headerCollapsed ? "gap-0" : "gap-4",
          )}
        >
          {renderCollapsiblePageHeader(
            <PageHeader
              icon={pageHeader.icon}
              title={pageHeader.title}
              center={inboxSearchFilterNode}
              actions={
                <>
                  {inboxPeriodNode}
                  {collapseHeaderBtn}
                </>
              }
            />,
          )}
          <div
            className="grid min-h-0 flex-1 gap-2 transition-[grid-template-columns] duration-200"
            style={{ gridTemplateColumns: `${convWidth}px 1fr ${effectiveAsideCollapsed ? "0px" : `${asideWidth}px`}` }}
          >
            {conversationColumnNode}
            {chatNode}
            <div className="relative h-full min-h-0 overflow-hidden">
              {!effectiveAsideCollapsed && (
                <ColumnResizer
                  direction="left"
                  value={asideWidth}
                  onChange={setAsideWidth}
                  min={240}
                  max={400}
                />
              )}
              {asideNode}
            </div>
          </div>
        </div>
        {expandHeaderBtn}
        {templateModalNode}
        {extraDialogsNode}
      </div>
    );
  }

  // Layout legado (linha única, sem topo) — usado por `(v2)/inbox-v2`.

  // ── Mobile: layout de painel único (lista → chat/negócio) ──────
  if (!isDesktop) {
    return (
      <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_minmax(0,1fr)] overflow-hidden">
        {navRailNode}
        <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
          {!activeId ? (
            <div className="min-h-0 flex-1 overflow-hidden">
              {conversationColumnNode}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Barra compacta: Voltar | busca/filtro | Chat | Negócio */}
              <div className="flex min-w-0 shrink-0 items-center gap-1 overflow-hidden border-b border-[var(--glass-border)] bg-[var(--glass-bg)] px-2 py-1.5">
                <button
                  type="button"
                  onClick={closeActiveConversation}
                  className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
                >
                  <IconArrowLeft size={14} stroke={2} />
                  Voltar
                </button>
                <div className="min-w-0 flex-1">
                  {compactInboxSearchFilterNode}
                </div>
                <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setMobilePaneTab("chat")}
                    className={cn(
                      "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                      mobilePaneTab === "chat"
                        ? "bg-[var(--brand-primary)] text-white shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <IconMessageCircle size={13} stroke={2} />
                    Chat
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobilePaneTab("negocio")}
                    className={cn(
                      "flex items-center gap-1 rounded-[calc(var(--radius-md)-2px)] px-2 py-1 text-[11px] font-semibold transition-colors",
                      mobilePaneTab === "negocio"
                        ? "bg-[var(--brand-primary)] text-white shadow-sm"
                        : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <IconBriefcase size={13} stroke={2} />
                    Negócio
                  </button>
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {mobilePaneTab === "chat" ? chatNode : asideNode}
              </div>
            </div>
          )}
        </div>
        {templateModalNode}
        {extraDialogsNode}
      </div>
    );
  }

  // ── Desktop: layout original de 4 colunas ─────────────────────
  return (
    <div
      className="v2-screen grid h-full min-h-0 overflow-hidden"
      style={{
        // Coluna 1 fixa (NavRail), 2 controlada pelo resizer, 3 flexível, 4 redimensionável.
        gridTemplateColumns: `var(--nav-rail-w, 72px) ${convWidth}px 1fr ${effectiveAsideCollapsed ? "0px" : `${asideWidth}px`}`,
        gridTemplateRows: "minmax(0, 1fr)",
      }}
    >
      {navRailNode}
      {conversationColumnNode}
      {chatNode}
      <div className="relative h-full min-h-0 overflow-hidden">
        {!effectiveAsideCollapsed && (
          <ColumnResizer
            direction="left"
            value={asideWidth}
            onChange={setAsideWidth}
            min={240}
            max={400}
          />
        )}
        {asideNode}
      </div>
      {templateModalNode}
      {extraDialogsNode}
    </div>
  );
}

function EmptyChatArea() {
  // `h-full min-h-0` cobre a coluna do grid; o card fica no centro do
  // container de conversa (não da página). Sem isso o main colapsava e
  // sobrava faixa vazia no F5.
  return (
    <main className="flex h-full min-h-0 w-full flex-col items-center justify-center p-6">
      <div
        className={cn(
          CARD_SURFACE_CLASS,
          "flex w-full max-w-md flex-col items-center px-8 py-12 text-center",
        )}
      >
        <div className="relative flex h-16 w-20 items-center justify-center text-primary">
          <IconDeviceLaptop size={64} stroke={1.25} aria-hidden />
          <IconMessageCircle
            className="absolute -translate-y-0.5"
            size={24}
            stroke={1.75}
            aria-hidden
          />
        </div>
        <h2 className="mt-6 font-display text-xl font-bold tracking-tight text-foreground">
          Selecione uma conversa
        </h2>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Mensagens, ligações e o histórico do contato aparecem aqui.
        </p>
      </div>
    </main>
  );
}

function NoDealTab({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-[var(--text-muted)]">
      <div className="font-display text-[13px] font-semibold">
        Nenhum negocio vinculado
      </div>
      <p className="max-w-xs text-[12px]">{message}</p>
    </div>
  );
}

function EmptyAside() {
  return (
    <aside
      aria-label="Detalhes do contato"
      // `h-full min-h-0` — mesma correção do EmptyChatArea. Sem isso,
      // quando o aside NÃO é colapsado (ex.: preferência do usuário
      // salva como aberto), o placeholder ficava com altura de conteúdo
      // e sobrava uma faixa vazia embaixo.
      className="flex h-full min-h-0 w-full items-center justify-center rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] p-6 text-center text-[12px] text-[var(--text-muted)] backdrop-blur-md shadow-[var(--glass-shadow)]"
    >
      Sem contato selecionado.
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────
// InboxStageDropdown — dropdown glass de troca de fase para o DealCard
// do ContactAside (inbox). Mesmo padrão visual do StageDropdown do pipeline.
// ─────────────────────────────────────────────────────────────────
function InboxStageDropdown({
  stages,
  currentStageId,
  currentPipelineId,
  isPending,
  canMove = true,
  onSelect,
}: {
  stages: PipelineListStageDto[];
  currentStageId: string | null;
  currentPipelineId: string | null;
  isPending: boolean;
  canMove?: boolean;
  onSelect: (stageId: string, toPipelineId?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = stages.find((s) => s.id === currentStageId);
  const disabled = isPending || !canMove;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      // Fecha ao clicar fora — o menu esta portado no body entao precisa
      // checar tambem se o clique caiu dentro do menu.
      const menu = document.getElementById("inbox-stage-dropdown-menu");
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Calcula posicao do trigger em coord de viewport (position:fixed) para o
  // portal — evita clip pelo overflow do aside e garante que o menu apareca
  // sempre por cima, sem "vazar" para fora quando encosta na borda direita.
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const b = triggerRef.current.getBoundingClientRect();
    const longest = stages.reduce((n, s) => Math.max(n, s.name.length), 0);
    const menuWidth = Math.min(
      Math.max(220, longest * 8 + 48),
      Math.min(320, window.innerWidth - 16),
    );
    const wouldOverflow = b.left + menuWidth > window.innerWidth - 8;
    const left = wouldOverflow ? Math.max(8, b.right - menuWidth) : b.left;
    setPos({ top: b.bottom + 4, left, width: menuWidth });
  }, [open, stages]);

  return (
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        title={canMove ? undefined : "Sem permissão para mover entre etapas"}
        onClick={() => {
          if (!canMove) return;
          setOpen((v) => !v);
        }}
        className={cn(
          "flex max-w-[min(100%,11rem)] items-center gap-1 font-display text-[11px] font-semibold text-[var(--text-muted)] transition-opacity hover:text-[var(--text-primary)] hover:opacity-80 disabled:opacity-50",
          isPending && "cursor-wait",
          !canMove && "cursor-default hover:opacity-100 hover:text-[var(--text-muted)]",
        )}
      >
        {current?.color && (
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: current.color }}
          />
        )}
        <span className="truncate">{current?.name ?? "Sem estagio"}</span>
        <IconChevronDown
          size={11}
          className={cn("shrink-0 transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            id="inbox-stage-dropdown-menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-(--z-popover) overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white py-1 shadow-[0_12px_32px_rgba(15,20,40,0.18)] v2-dark:bg-[#1a1f2e] v2-dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
          >
            <MoveToStageMenu
              stages={stages}
              currentStageId={currentStageId}
              currentPipelineId={currentPipelineId}
              isPending={isPending}
              onSelect={(stageId, toPipeId) => {
                onSelect(stageId, toPipeId);
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )
      }
    </div>
  );
}
