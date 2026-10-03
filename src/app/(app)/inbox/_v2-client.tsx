"use client";

import { useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { RequirePermission } from "@/components/auth/require-permission";
import { useCan, useMyPermissions } from "@/hooks/use-my-permissions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import dynamic from "next/dynamic";
import { NavRail } from "@/components/crm/nav-rail";
import { ConversationColumn } from "@/components/crm/conversation-column";
import { KeepPeekPanel } from "@/features/keeps/keep-peek-panel";

const FavoritesPanel = dynamic(
  () =>
    import("@/components/crm/favorites-panel").then((m) => ({
      default: m.FavoritesPanel,
    })),
  { ssr: false },
);
const ChatArea = dynamic(
  () =>
    import("@/components/crm/chat-area").then((m) => ({
      default: m.ChatArea,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-0 flex-1 bg-[var(--glass-bg-base)]" />
    ),
  },
);
import { InboxPeriodCalendar } from "@/features/inbox-v2/extras/inbox-period-calendar";
import {
  ColumnResizer,
  usePersistentWidth,
} from "@/components/crm/column-resizer";
import { useIsDesktop } from "@/hooks/use-media-query";

import { toChatContact, toContactAside } from "@/features/inbox-v2/adapters";
import {
  useConversationFeatures,
  useContactSidebar,
  useInboxRealtime,
  useInboxSafetyPoll,
  useMessages,
  useInboxSoundMuted,
} from "@/features/inbox-v2/hooks";
import { useInboxActiveConversation } from "@/features/inbox-v2/hooks/use-inbox-active-conversation";
import { useInboxActiveConversationSync } from "@/features/inbox-v2/hooks/use-inbox-active-conversation-sync";
import { useInboxBulkActions } from "@/features/inbox-v2/hooks/use-inbox-bulk-actions";
import { useInboxConversationList } from "@/features/inbox-v2/hooks/use-inbox-conversation-list";
import { useInboxConversationReopen } from "@/features/inbox-v2/hooks/use-inbox-conversation-reopen";
import { useInboxFirstDeal } from "@/features/inbox-v2/hooks/use-inbox-first-deal";
import { useInboxHeaderCollapse } from "@/features/inbox-v2/hooks/use-inbox-header-collapse";
import { useInboxMessageActions } from "@/features/inbox-v2/hooks/use-inbox-message-actions";
import { useInboxMessageBubbles } from "@/features/inbox-v2/hooks/use-inbox-message-bubbles";
import { useInboxMobilePane } from "@/features/inbox-v2/hooks/use-inbox-mobile-pane";
import { useInboxOutboundChannel } from "@/features/inbox-v2/hooks/use-inbox-outbound-channel";
import { useInboxQueueRefresh } from "@/features/inbox-v2/hooks/use-inbox-queue-refresh";
import { useInboxSelection } from "@/features/inbox-v2/hooks/use-inbox-selection";
import { useInboxVisibleTabs } from "@/features/inbox-v2/hooks/use-inbox-visible-tabs";
import {
  AssigneePopover,
  Composer,
  ConversationActionsMenu,
  ConversationTimelineTab,
  InboxFilterButton,
  TransferPopover,
  WhatsappTemplatePickerModal,
  whatsappTemplateToPending,
  type PendingTemplate,
} from "@/features/inbox-v2/extras";
import { useUserRole } from "@/hooks/use-user-role";
import { InboxSearchFilterBar } from "@/features/inbox-v2/extras/filter-panel";
import { PageTourButton } from "@/features/product-tour";
import {
  isSessionClosedError,
  SESSION_CLOSED_TOAST,
} from "@/features/inbox-v2/extras/channel-switch-confirm";
import type { ConversationListRow } from "@/features/inbox-v2/api";
import { inboxQueueTabFor, pickVisibleInboxTab, rowBelongsToAnyInboxTab } from "@/features/inbox-v2/inbox-queue-tab";
import { toInboxListCards } from "@/features/inbox-v2/inbox-list-order";
import {
  isInboxTab,
  serializeInboxTabs,
  toggleInboxTab,
  useInboxFilterUrlState,
} from "@/features/inbox-v2/hooks/use-inbox-filters-url-sync";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CallHistoryList } from "@/features/softphone/components/call-history-list";
import { DealCallButton } from "@/features/softphone/components/deal-call-button";
import {
  conversationHasCallingHint,
  WhatsappCallChip,
} from "@/components/inbox/whatsapp-call-chip";
import { ActivitiesPanel } from "@/components/pipeline/deal-workspace/panels/activities";
import { DealNotesTab } from "@/features/pipeline-v2/extras";

import { InboxContactAside } from "./_components/inbox-contact-aside";
import {
  InboxBulkActionsBar,
  InboxBulkResolveDialogs,
  InboxColumnMoreMenu,
} from "./_components/inbox-list-controls";
import { EmptyAside, EmptyChatArea, NoDealTab } from "./_components/inbox-placeholders";
import { InboxShell } from "./_components/inbox-shell";

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
  /** Query do request (SSR) — hidrata aba/filtros no 1º render. */
  urlQuery?: string;
}

export default function InboxV2ClientPage({
  navRail,
  pageHeader,
  urlQuery,
}: InboxV2ClientPageProps = {}) {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  // Cookie do tenant já autentica o GET. Não espera o NextAuth hidratar.
  const canFetchInbox = sessionStatus !== "unauthenticated";
  const isDesktop = useIsDesktop();
  const { data: myPermissions } = useMyPermissions();
  const sessionRole = (session?.user as { role?: string } | undefined)?.role;
  const { isSuperAdmin } = useUserRole();
  const canSkipAutomations = isSuperAdmin || sessionRole === "ADMIN";

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
  } = useInboxFilterUrlState(urlQuery);
  const visibleTabs = useInboxVisibleTabs({
    sessionRole,
    myPermissions,
    tab,
    setTab,
    tabHydrated,
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  // "Buscar na conversa" do kebab abre a busca inline do ChatArea.
  const searchControlRef = useRef<{ open: () => void } | null>(null);
  // Template escolhido no modal (sessão expirada) → abre o painel no Composer.
  const [externalTemplate, setExternalTemplate] = useState<PendingTemplate | null>(null);
  // Sem conversa ativa, força o aside a ficar colapsado — evita a "faixa
  // fantasma" branca à direita no F5 (aside visível mas sem contato pra
  // exibir). Assim que o operador seleciona uma conversa, respeita a
  // preferência do usuário (`asideCollapsed`).
  const [asideCollapsed, setAsideCollapsed] = useState(false);

  const { headerCollapsed, setHeaderCollapsed, headerHydrated } =
    useInboxHeaderCollapse();

  // ── Seleção múltipla + ações em massa (encerrar/reabrir) ────────
  const { confirm: confirmDialog, dialog: confirmDialogNode } = useConfirm();
  // Os dois `useCan` precisam ser chamados sempre: com `||` o segundo era
  // pulado quando o primeiro virava true (authz carregou), mudando a
  // contagem de hooks entre renders e derrubando o inbox.
  const canReassignOthers = useCan("conversation:reassign_others");
  const canTransferConversation = useCan("conversation:transfer");
  const canBulkAssign = canReassignOthers || canTransferConversation;
  const {
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    selectAllFilter,
    setSelectAllFilter,
    exitSelectionMode,
    toggleSelectOne,
  } = useInboxSelection(tab);

  const [mobilePaneTab, setMobilePaneTab] = useInboxMobilePane(activeId);

  // ── Dados ───────────────────────────────────────────────────────
  const {
    serverFilters,
    listData,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
    handleLoadMore,
    listBootstrapping,
    rows,
    tabCounts,
    filterTotal,
  } = useInboxConversationList({
    tab,
    filters,
    canFetchInbox,
    tabHydrated,
    filtersHydrated,
    sessionStatus,
  });

  const {
    stickyRow,
    setStickyRow,
    pinnedFromSearch,
    setPinnedFromSearch,
    displayRows,
    foundActiveRow,
    conversationApiId,
    activeRow,
    closeActiveConversation,
  } = useInboxActiveConversation({
    activeId,
    setActiveId,
    rows,
    listData,
    visibleTabs,
    tab,
    replaceTab,
  });
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
    error: messagesErrorObj,
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
    enabled: canFetchInbox && tabHydrated && filtersHydrated,
  });
  // SSE fora (ou parado) com a aba visível: lista + contadores a cada 90s.
  useInboxSafetyPoll(canFetchInbox && tabHydrated && filtersHydrated);

  const handleReopenNewConversation = useInboxConversationReopen(setActiveId, setTab);

  function handleFollowedUp(id: string) {
    setStickyRow((prev) =>
      prev?.id === id
        ? {
            ...prev,
            status: "OPEN",
            closedAt: null,
            followUpAt: new Date().toISOString(),
          }
        : prev,
    );
    setTab(["resolvidos"]);
  }

  // ── Mutations ───────────────────────────────────────────────────
  const contactName = activeRow?.contact?.name ?? "";
  const {
    sendMessage,
    markRead,
    bulkAction,
    pinDurationDialog,
    favoritesOpen,
    setFavoritesOpen,
    replyTo,
    setReplyTo,
    handleReactMessage,
    handlePinMessage,
    handleUnpinMessage,
    handleFavoriteMessage,
    handleReplyMessage,
  } = useInboxMessageActions(conversationApiId, contactName);
  const { features: convFeatures } = useConversationFeatures();

  useInboxActiveConversationSync({
    activeId,
    setActiveId,
    conversationApiId,
    sessionInfo,
    messagesErrorObj,
  });

  const { inboxRefreshing, refreshInboxQueue } = useInboxQueueRefresh({
    tab,
    canFetchInbox,
    tabHydrated,
    filtersHydrated,
  });

  const {
    bulkTabulationOpen,
    bulkTabulationDeptId,
    bulkTabulationUserId,
    bulkConfirmOpen,
    executeBulkResolve,
    handleBulkAction,
    handleBulkTabulationOpenChange,
    handleBulkConfirmOpenChange,
    handleBulkReassignQueued,
    handleBulkReassignPersisted,
  } = useInboxBulkActions({
    bulkAction,
    selectedIds,
    selectAllFilter,
    exitSelectionMode,
    filterTotal,
    tab,
    setTab,
    serverFilters,
    displayRows,
    sessionUserId: session?.user?.id ?? null,
    canSkipAutomations,
    refreshInboxQueue,
  });

  const {
    whatsappChannels,
    conversationChannelId,
    lastMessageChannelId,
    selectedChannelId,
    setSelectedChannelId,
    effectiveProvider,
    sessionExpiredEffective,
    composerDisabled,
    composerPlaceholder,
  } = useInboxOutboundChannel({
    canFetchInbox,
    conversationApiId,
    messagesData,
    activeRow,
  });

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
    if (
      queue &&
      !tab.includes("todos") &&
      !rowBelongsToAnyInboxTab(row, tab)
    ) {
      setTab([queue]);
    }
    if (row.id !== activeId) {
      setActiveId(row.id);
      markRead.mutate(row.id);
      setReplyTo(null);
    }
    setSearchInput("");
    setMobilePaneTab("chat");
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
      toInboxListCards(displayRows, { tab, activeId }),
    [displayRows, activeId, tab],
  );
  const { messageBubbles, pinnedMessagesPreview } = useInboxMessageBubbles(
    messagesData,
    messages,
    contactName,
  );
  const chatContact = activeRow ? toChatContact(activeRow) : null;
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
    />
  );

  const inboxSearchFilterWithPeriodNode = (
    <InboxSearchFilterBar
      search={searchInput}
      onSearch={setSearchInput}
      filters={filters}
      onChangeFilters={setFilters}
      onPickConversation={handlePickSearchConversation}
      period={inboxPeriodNode}
      trailing={<PageTourButton tourId="inbox" />}
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
          <InboxColumnMoreMenu
            soundMuted={soundMuted}
            setSoundMuted={setSoundMuted}
            selectionMode={selectionMode}
            onEnterSelectionMode={() => setSelectionMode(true)}
            onExitSelectionMode={exitSelectionMode}
          />
          {!searchInHeader && (
            <InboxFilterButton value={filters} onChange={setFilters} />
          )}
          {confirmDialogNode}
          <InboxBulkResolveDialogs
            tabulationOpen={bulkTabulationOpen}
            onTabulationOpenChange={handleBulkTabulationOpenChange}
            departmentId={bulkTabulationDeptId}
            userId={bulkTabulationUserId}
            confirmOpen={bulkConfirmOpen}
            onConfirmOpenChange={handleBulkConfirmOpenChange}
            submitting={bulkAction.isPending}
            canSkipAutomations={canSkipAutomations}
            onResolve={executeBulkResolve}
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
      bulkActionsSlot={
        <InboxBulkActionsBar
          selectedIds={selectedIds}
          selectAllFilter={selectAllFilter}
          pending={bulkAction.isPending}
          canBulkAssign={canBulkAssign}
          filterTotal={filterTotal}
          tab={serializeInboxTabs(tab)}
          filters={serverFilters as Record<string, unknown>}
          onBulkAction={handleBulkAction}
          onReassignQueued={handleBulkReassignQueued}
          onReassignPersisted={handleBulkReassignPersisted}
          onExitSelectionMode={exitSelectionMode}
        />
      }
      tabsOverride={visibleTabs.map((t) => {
        const count = listBootstrapping
          ? undefined
          : tabCounts?.[t.id];
        return {
          id: t.id,
          label: t.label,
          description: t.description,
          group: t.group,
          groupLabel: t.groupLabel,
          groupTone: t.groupTone,
          count,
          title: t.title,
        };
      })}
      selectedTabIds={tab}
      onToggleTab={(id) => {
        if (isInboxTab(id)) setTab((current) => toggleInboxTab(current, id));
      }}
      activeTabIndex={visibleTabs.findIndex((t) => t.id === tab[0])}
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

  // ── Funil do primeiro deal ──────────────────────────────────────
  const firstDealState = useInboxFirstDeal({
    contactAsideView,
    effectiveAsideCollapsed,
    canFetchInbox,
  });
  const {
    firstDeal,
    firstDealId,
    firstDealDetail,
    firstDealPipelineId,
    firstDealPipelineName,
    firstDealStageName,
  } = firstDealState;

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
  const timelineSlot = conversationApiId ? (
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
        channelProvider={effectiveProvider}
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
        searchControlRef={searchControlRef}
        headerActionsSlot={
          <>
            <WhatsappCallChip
              conversationId={activeRow.id}
              channel={activeRow.channel}
              variant="cta"
              hasCalling={tab.includes("ligar") || conversationHasCallingHint(activeRow)}
              contactName={
                contactAsideView?.name ?? activeRow.contact?.name ?? null
              }
            />
            <ConversationActionsMenu
              conversationId={conversationApiId}
              conversationNumber={activeRow?.number}
              contactId={activeContactId}
              isResolved={activeRow.status === "RESOLVED"}
              assigneeName={activeRow.assignedTo?.name ?? null}
              assigneeType={activeRow.assignedTo?.type ?? null}
              aiHandoffContext={{
                deals: (contactAsideView?.deals ?? []).map((d) => ({
                  pipelineId: d.pipelineId ?? firstDealPipelineId,
                  stageId: d.stageId ?? firstDeal?.stageId,
                  pipelineName: d.pipelineName ?? firstDealPipelineName,
                  stageName: d.stageName ?? firstDealStageName,
                })),
                departmentName: activeRow.department?.name ?? null,
              }}
              onSearchInConversation={() => searchControlRef.current?.open()}
              onOpenFavorites={() => setFavoritesOpen(true)}
              dealId={firstDealId}
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
            assignedToId={activeRow.assignedToId ?? null}
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
            onFollowedUp={handleFollowedUp}
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
          isDesktop ? (
            <DealCallButton
              fab
              dealId={firstDealId}
              phone={chatContact?.phone || null}
              contactId={activeContactId ?? undefined}
            />
          ) : null
        }
        notesSlot={notesSlot}
        activitiesSlot={activitiesSlot}
        timelineSlot={timelineSlot}
        callsSlot={callsSlot}
        keepsSlot={<KeepPeekPanel />}
      />
    ) : (
      <EmptyChatArea />
    );

  const asideNode =
    contactAsideView && activeRow ? (
      <InboxContactAside
        contactAsideView={contactAsideView}
        firstDeal={firstDealState}
        conversationId={conversationApiId}
        conversationAssigneeId={activeRow?.assignedTo?.id ?? null}
        confirmDialog={confirmDialog}
        conversationTags={activeTags}
        contactId={activeContactId}
        contactTags={contactDetail?.tags}
        collapsed={effectiveAsideCollapsed}
        onToggleCollapse={() => setAsideCollapsed((v) => !v)}
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

  const mobileCallButton = (
    <DealCallButton
      dealId={firstDealId}
      phone={chatContact?.phone || null}
      contactId={activeContactId ?? undefined}
    />
  );

  return (
    <InboxShell
      pageHeader={pageHeader}
      isDesktop={isDesktop}
      navRail={navRailNode}
      hasActiveConversation={!!activeId}
      onCloseConversation={closeActiveConversation}
      headerCollapsed={headerCollapsed}
      headerHydrated={headerHydrated}
      setHeaderCollapsed={setHeaderCollapsed}
      mobilePaneTab={mobilePaneTab}
      setMobilePaneTab={setMobilePaneTab}
      conversationColumn={conversationColumnNode}
      chat={chatNode}
      aside={asideNode}
      asideCollapsed={effectiveAsideCollapsed}
      convWidth={convWidth}
      asideWidth={asideWidth}
      setAsideWidth={setAsideWidth}
      period={inboxPeriodNode}
      searchFilter={inboxSearchFilterNode}
      searchFilterWithPeriod={inboxSearchFilterWithPeriodNode}
      compactSearchFilter={compactInboxSearchFilterNode}
      mobileCallButton={mobileCallButton}
      templateModal={templateModalNode}
      extraDialogs={extraDialogsNode}
    />
  );
}
