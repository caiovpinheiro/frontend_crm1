"use client";

import { apiUrl } from "@/lib/api";
import {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowLeft,
  IconBriefcase as Briefcase,
  IconMessageOff as MessageSquareOff,
  IconMessages as MessagesIcon,
  IconPin as Pin,
  IconPinFilled as PinFilled,
  IconPlus as Plus,
  IconX as X,
} from "@tabler/icons-react";

import type { BoardStage } from "@/components/pipeline/kanban-board";
import type { BoardDeal } from "@/components/pipeline/kanban-types";
import { AppLoading } from "@/components/crm/app-loading";
import { ConversationPaneSkeleton } from "@/components/crm/conversation-skeleton";
import { useStageUrlSync } from "@/features/pipeline-v2/hooks";
import { StageRibbon } from "@/components/sales-hub/stage-ribbon";
import {
  DealQueue,
  DealQueueSortMenu,
  type DealQueueSortMode,
} from "@/components/sales-hub/deal-queue";
import { SalesHubChat } from "@/components/sales-hub/sales-hub-chat";
import {
  conversationHasCallingHint,
  WhatsappCallChip,
} from "@/components/inbox/whatsapp-call-chip";
import { ConversationActionsMenu } from "@/features/inbox-v2/extras";
import { TagsPopover } from "@/features/pipeline-v2/extras";
import { TagChip } from "@/components/crm/tag-chip";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
  DealDetailPanel,
  type DealDetail,
} from "@/components/crm/deal-detail-panel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TooltipHost } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome";
import {
  cn,
  dealNumericValue,
  formatCurrency,
  pipelineDealMatchesSearch,
} from "@/lib/utils";

const ASIDE_PINNED_KEY = "crm:saleshub:aside-pinned:v1";

function readAsidePinned(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(ASIDE_PINNED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * ConversationItem mínimo que o SalesHub precisa pra resolver a conversa
 * ativa a partir do `contactId` do deal selecionado.
 *
 * Inclui `assignedToId` porque o `TransferPopover` do Composer (mesmo do
 * Inbox) destaca o responsável atual, e `lastInboundAt` porque é o
 * fallback da janela de 24h da Meta quando o backend não devolve o
 * objeto `session` junto das mensagens.
 */
type ConversationRow = {
  id: string;
  number?: number | null;
  channel: string;
  status: string;
  updatedAt: string;
  lastInboundAt?: string | null;
  assignedToId: string | null;
  assignedTo?: { id: string; name: string; email?: string | null } | null;
  tags?: { id?: string; name: string; color: string }[] | null;
};

async function fetchContactConversations(
  contactId: string,
): Promise<ConversationRow[]> {
  const res = await fetch(apiUrl(`/api/conversations?contactId=${contactId}&perPage=10`));
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data.items)
    ? data.items
    : Array.isArray(data)
      ? data
      : [];
}

function SalesHubChatEmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  // Surface neutra usando tokens do tema — `bg-white` virava placa
  // branca destoante em dark mode. Agora segue o background do app.
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-[var(--color-chat-bg)] p-8">
      <MessageSquareOff
        className="size-7 text-[var(--text-muted)]"
        strokeWidth={1.5}
      />
      <p className="font-display text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
        {title}
      </p>
      <p className="max-w-xs text-center text-[13px] text-[var(--text-muted)]">
        {subtitle}
      </p>
    </div>
  );
}

type StatusFilter = "OPEN" | "WON" | "LOST" | "ALL";

/**
 * Props do Sales Hub.
 *
 * Modo controlado (obrigatório no host `/saleshub`): `activeDealId` +
 * `onActiveDealChange` espelham `useDealDeepLink` (`?deal=`). O host
 * também passa `detailDeal` (VM do `DealDetailPanel` na coluna CRM).
 * Busca/filtros vêm do header (`PipelineSearchFilterBar` no host);
 * a fila só expõe ordenação local (`sortMode`).
 */
export type SalesHubViewProps = {
  pipelineId: string;
  stages: BoardStage[];
  /**
   * Status ativo no topo da página (Abertos/Ganhos/Perdidos/Todos).
   * Usado para montar a queryKey correta do board e permitir que o
   * DealCrmPanel faça update otimista no cache quando o quick-move
   * é disparado.
   */
  statusFilter?: StatusFilter;
  filter?: "mine" | "urgent" | "vip" | null;
  currentUserId?: string;
  /** Busca curta client-side (host usa server search quando ≥2 chars). */
  searchQuery?: string;
  filterAgent?: string;
  filterStage?: string;
  filterMsg?: "all" | "unread" | "no-reply";
  filterOverdue?: boolean;
  /** Abre o `DealWorkspace` (ex.: link “deal completo” na fila). */
  onOpenFullDeal?: (dealId: string) => void;
  sortMode: DealQueueSortMode;
  onSortModeChange: (mode: DealQueueSortMode) => void;
  /**
   * Paginação de rede da fila (board normal, sem filtros server-side):
   * `queueHasMore` sinaliza que alguma etapa tem mais deals no servidor;
   * `onQueueLoadMore` expande +50 na etapa focada (ou em todas, se Todos).
   */
  queueHasMore?: boolean;
  queueLoadingMore?: boolean;
  onQueueLoadMore?: (stageId?: string | null) => void;
  /** Board ainda sem dados — fila mostra skeleton, não "Nenhum deal". */
  queueBoardPending?: boolean;
  /** Seleção controlada pelo host (`useDealDeepLink` em `/saleshub`). */
  activeDealId: string | null;
  onActiveDealChange: (dealId: string | null, dealNumber?: number | null) => void;
  /** VM do DealDetailPanel (coluna CRM inline). */
  detailDeal?: DealDetail | null;
  /**
   * Campos personalizados (contato + negócio) — mesma carga do kanban
   * (`customFieldsSlot` no DealDetailPanel). Sem isso, crmOnly só mostra
   * nativos de contato e omite "Informações do Negócio".
   */
  customFieldsSlot?: ComponentProps<typeof DealDetailPanel>["customFieldsSlot"];
  contactFieldConfigSlot?: ReactNode;
  dealFieldConfigSlot?: ReactNode;
};

export function SalesHubView({
  pipelineId,
  stages,
  statusFilter = "OPEN",
  filter,
  currentUserId,
  searchQuery = "",
  filterAgent = "all",
  filterStage = "all",
  filterMsg = "all",
  filterOverdue = false,
  onOpenFullDeal,
  sortMode,
  onSortModeChange,
  queueHasMore,
  queueLoadingMore,
  queueBoardPending = false,
  onQueueLoadMore,
  activeDealId,
  onActiveDealChange,
  detailDeal = null,
  customFieldsSlot,
  contactFieldConfigSlot,
  dealFieldConfigSlot,
}: SalesHubViewProps) {
  const isMdUp = useMediaQuery("(min-width: 768px)", true);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  /** Só sobe em troca explícita de etapa (ribbon/atalho) — limpa a fila. */
  const [stageSwitchToken, setStageSwitchToken] = useState(0);
  const selectedStageIdRef = useRef<string | null>(null);

  const setStageFromUrl = useCallback((id: string | null) => {
    selectedStageIdRef.current = id;
    setSelectedStageId(id);
  }, []);

  const { hydrated: stageHydrated } = useStageUrlSync(
    stages,
    selectedStageId,
    setStageFromUrl,
    pipelineId,
  );
  const stageRestorePending = !stageHydrated && stages.length > 0;
  const chromePending = queueBoardPending || stageRestorePending;
  const [recentlyMovedDealId, setRecentlyMovedDealId] = useState<string | null>(
    null,
  );
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [asidePinned, setAsidePinned] = useState(false);

  const [pickedConversationId, setPickedConversationId] = useState<
    string | null
  >(null);
  const [convListOpen, setConvListOpen] = useState(false);

  useEffect(() => {
    setAsidePinned(readAsidePinned());
  }, []);

  const toggleAsidePinned = useCallback(() => {
    setAsidePinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(ASIDE_PINNED_KEY, next ? "1" : "0");
      } catch {
        /* ignore quota / private mode */
      }
      return next;
    });
  }, []);

  /**
   * Experimento UX: ao sair do painel de chat pela borda direita, abre a
   * coluna CRM inline (DealDetailPanel — negócios + contatos), comprimindo
   * o chat. Saída à esquerda (fila) ou vertical não abre. `mouseleave` já
   * ignora filhos; o threshold evita flicker ao cruzar bordas / portais.
   */
  const CHAT_RIGHT_LEAVE_PX = 28;
  const handleChatPaneMouseLeave = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!activeDealId || detailsOpen) return;
      const related = e.relatedTarget;
      if (related instanceof Node && e.currentTarget.contains(related)) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const leavingRight = e.clientX >= rect.right - CHAT_RIGHT_LEAVE_PX;
      if (!leavingRight) return;

      setDetailsOpen(true);
    },
    [activeDealId, detailsOpen],
  );

  /** Fecha a aside CRM ao sair com o mouse, salvo se estiver pinada. */
  const ASIDE_LEAVE_CLOSE_MS = 150;
  const asideLeaveCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearAsideLeaveCloseTimer = useCallback(() => {
    if (asideLeaveCloseTimerRef.current != null) {
      clearTimeout(asideLeaveCloseTimerRef.current);
      asideLeaveCloseTimerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearAsideLeaveCloseTimer(), [clearAsideLeaveCloseTimer]);

  const handleAsideMouseEnter = useCallback(() => {
    clearAsideLeaveCloseTimer();
  }, [clearAsideLeaveCloseTimer]);

  const handleAsideMouseLeave = useCallback(
    (e: ReactMouseEvent<HTMLElement>) => {
      if (asidePinned) return;
      const related = e.relatedTarget;
      if (related instanceof Node && e.currentTarget.contains(related)) return;
      // Dropdowns/tooltips portaled (Radix) ainda "pertencem" à aside.
      if (
        related instanceof Element &&
        related.closest("[data-radix-portal], [data-radix-popper-content-wrapper]")
      ) {
        return;
      }

      clearAsideLeaveCloseTimer();
      asideLeaveCloseTimerRef.current = setTimeout(() => {
        asideLeaveCloseTimerRef.current = null;
        setDetailsOpen(false);
      }, ASIDE_LEAVE_CLOSE_MS);
    },
    [asidePinned, clearAsideLeaveCloseTimer],
  );

  useEffect(() => {
    setPickedConversationId(null);
  }, [activeDealId]);

  // Troca de deal (card → chat): fecha a aside CRM, salvo se estiver pinada.
  const prevActiveDealIdRef = useRef<string | null>(activeDealId);
  useEffect(() => {
    if (prevActiveDealIdRef.current === activeDealId) return;
    prevActiveDealIdRef.current = activeDealId;
    if (!asidePinned) setDetailsOpen(false);
  }, [activeDealId, asidePinned]);

  // Deep-link / seleção externa: se o deal ativo está em outra etapa, foca a aba.
  // Em "Todos" o deal já aparece na fila — focar a etapa dele aqui faria o
  // clique em "Todos" (que abre o 1º deal) saltar para a primeira etapa.
  useEffect(() => {
    if (!activeDealId) return;
    if (selectedStageIdRef.current === null) return;
    const stage = stages.find((s) =>
      s.deals.some(
        (d) => d.id === activeDealId || String(d.number) === activeDealId,
      ),
    );
    if (stage && selectedStageId !== stage.id) {
      selectedStageIdRef.current = stage.id;
      setSelectedStageId(stage.id);
    }
    // Só reage a mudança de deal (não a selectedStageId) pra não loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDealId, stages]);

  const filteredStages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const hasAny =
      filter ||
      q ||
      filterAgent !== "all" ||
      filterStage !== "all" ||
      filterMsg !== "all" ||
      filterOverdue;
    if (!hasAny) return stages;

    const stagesSource =
      filterStage !== "all"
        ? stages.filter((s) => s.id === filterStage)
        : stages;

    return stagesSource.map((s) => ({
      ...s,
      deals: s.deals.filter((d) => {
        if (filter === "mine" && d.owner?.id !== currentUserId) return false;
        if (filter === "urgent" && !(d.priority === "HIGH" || d.isRotting))
          return false;
        if (
          filter === "vip" &&
          !d.tags?.some((t) => t.name.toLowerCase() === "vip")
        )
          return false;

        if (filterAgent === "none" && d.owner) return false;
        if (
          filterAgent !== "all" &&
          filterAgent !== "none" &&
          d.owner?.id !== filterAgent
        )
          return false;

        if (filterMsg === "unread" && !(d.unreadCount && d.unreadCount > 0))
          return false;
        if (filterMsg === "no-reply" && d.lastMessage?.direction !== "in")
          return false;

        if (filterOverdue && !d.hasOverdueActivity) return false;

        if (q) {
          return pipelineDealMatchesSearch(searchQuery, {
            title: d.title,
            contactName: d.contact?.name,
            contactEmail: d.contact?.email,
            contactPhone: d.contact?.phone,
            ownerName: d.owner?.name,
            productName: d.productName,
            tagNames: d.tags?.map((t) => t.name),
            dealNumber: d.number,
          });
        }

        return true;
      }),
    }));
  }, [
    stages,
    filter,
    currentUserId,
    searchQuery,
    filterAgent,
    filterStage,
    filterMsg,
    filterOverdue,
  ]);

  const sortedDeals = useMemo(() => {
    const source = selectedStageId
      ? filteredStages.filter((s) => s.id === selectedStageId)
      : filteredStages;

    const flat: (BoardDeal & { stageId: string })[] = source.flatMap((s) =>
      s.deals.map((d) => ({ ...d, stageId: s.id })),
    );

    const getMessageTime = (d: BoardDeal): number =>
      d.lastMessage?.createdAt ? new Date(d.lastMessage.createdAt).getTime() : 0;
    const getCreatedTime = (d: BoardDeal): number =>
      d.createdAt ? new Date(d.createdAt).getTime() : 0;

    return flat.sort((a, b) => {
      switch (sortMode) {
        case "message_new":
          return getMessageTime(b) - getMessageTime(a);
        case "message_old":
          return getMessageTime(a) - getMessageTime(b);
        case "created_new":
          return getCreatedTime(b) - getCreatedTime(a);
        case "created_old":
          return getCreatedTime(a) - getCreatedTime(b);
        default:
          return 0;
      }
    });
  }, [filteredStages, selectedStageId, sortMode]);

  // Com o board paginado (50/etapa), `deals.length` sub-reporta — usa o
  // total real da etapa quando o backend o envia.
  const totalDeals = filteredStages.reduce(
    (sum, s) => sum + (s.totalCount ?? s.deals.length),
    0,
  );

  const activeDeal =
    sortedDeals.find(
      (d) =>
        d.id === activeDealId ||
        (activeDealId != null && String(d.number) === activeDealId),
    ) ??
    stages
      .flatMap((s) => s.deals)
      .find(
        (d) =>
          d.id === activeDealId ||
          (activeDealId != null && String(d.number) === activeDealId),
      ) ??
    null;

  useMobileChatChrome(!!activeDealId);

  // Resolve a conversa do contato do deal ativo. Usa o mesmo endpoint
  // que o inbox/deal-detail consome — garante que a conversa carregada
  // é exatamente a mesma independente do ponto de entrada (inbox, kanban
  // card, list view ou sales hub).
  const activeContactId =
    activeDeal?.contact?.id ?? detailDeal?.contactId ?? null;
  const { data: contactConversations = [], isLoading: conversationsLoading } =
    useQuery({
      queryKey: ["saleshub-contact-conversations", activeContactId],
      queryFn: () => fetchContactConversations(activeContactId!),
      enabled: !!activeContactId,
      staleTime: 30_000,
    });
  const activeConversation = useMemo(() => {
    if (contactConversations.length === 0) return null;
    if (pickedConversationId) {
      return (
        contactConversations.find((c) => c.id === pickedConversationId) ??
        contactConversations[0] ??
        null
      );
    }
    return contactConversations[0] ?? null;
  }, [contactConversations, pickedConversationId]);

  const queryClient = useQueryClient();

  // Reabrir (envio em conversa encerrada / menu "+") gera um ticket novo:
  // aponta o hub pro id novo e recarrega a lista de conversas do contato.
  const handleConversationReopened = useCallback(
    (newConversationId: string) => {
      setPickedConversationId(newConversationId);
      queryClient.invalidateQueries({
        queryKey: ["saleshub-contact-conversations", activeContactId],
      });
    },
    [activeContactId, queryClient],
  );

  const resolveDealNumber = useCallback(
    (dealId: string) => {
      const d = stages
        .flatMap((s) => s.deals)
        .find((x) => x.id === dealId);
      return d?.number ?? null;
    },
    [stages],
  );

  const handleSelectDeal = useCallback(
    (dealId: string) => {
      onActiveDealChange(dealId, resolveDealNumber(dealId));
    },
    [onActiveDealChange, resolveDealNumber],
  );

  const handleSelectStage = useCallback(
    (stageId: string | null) => {
      if (selectedStageIdRef.current !== stageId) {
        selectedStageIdRef.current = stageId;
        setSelectedStageId(stageId);
        setStageSwitchToken((t) => t + 1);
      }
      // Mobile: só filtra a fila — abrir o 1º deal esconderia a lista.
      if (!isMdUp) return;
      const source = stageId
        ? filteredStages.filter((s) => s.id === stageId)
        : filteredStages;
      const first = source.flatMap((s) => s.deals)[0];
      // Board ainda vazio (refresh): não apagar ?deal= / seleção atual.
      if (!first) return;
      if (activeDealId) {
        const keep = source.some((s) =>
          s.deals.some(
            (d) =>
              d.id === activeDealId || String(d.number) === activeDealId,
          ),
        );
        if (keep) return;
      }
      onActiveDealChange(first.id, first.number ?? null);
    },
    [activeDealId, filteredStages, isMdUp, onActiveDealChange],
  );

  const handleDeselectDeal = useCallback(() => {
    onActiveDealChange(null);
  }, [onActiveDealChange]);

  // 1ª abertura do Flow (sem ?deal=): seleciona o 1º da fila para já
  // entrar no layout split (fila + chat), em vez de cards em largura total.
  // No mobile a fila ocupa a tela — não auto-selecionar.
  const didInitialSelectRef = useRef(false);
  useEffect(() => {
    if (didInitialSelectRef.current) return;
    if (activeDealId) {
      didInitialSelectRef.current = true;
      return;
    }
    if (!isMdUp) return;
    // Espera a etapa salva ser restaurada — abrir o 1º deal do board antes
    // disso joga a seleção para a etapa dele e perde a fase anterior.
    if (!stageHydrated) return;
    const first = sortedDeals[0];
    if (!first) return;
    didInitialSelectRef.current = true;
    onActiveDealChange(first.id, first.number ?? null);
  }, [activeDealId, isMdUp, sortedDeals, onActiveDealChange, stageHydrated]);

  const handleDealMoved = useCallback((dealId: string) => {
    // Highlight visual por 1.5s pra sinalizar o "salto" entre etapas.
    setRecentlyMovedDealId(dealId);
    const t = setTimeout(() => setRecentlyMovedDealId(null), 1500);
    return () => clearTimeout(t);
  }, []);

  const funnelStages = useMemo(
    () =>
      filteredStages.map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        // Com board paginado (50/etapa) `deals.length` sub-reporta — usa o
        // total real da etapa quando o backend o envia.
        count: s.totalCount ?? s.deals.length,
      })),
    [filteredStages],
  );

  /** Header da fila — espelha o header de coluna do kanban CRM. */
  const queueStageHeader = useMemo(() => {
    if (selectedStageId) {
      const stage = filteredStages.find((s) => s.id === selectedStageId);
      if (stage) {
        return {
          name: stage.name,
          color: stage.color || "var(--brand-primary)",
          // Com board paginado (50/etapa) `deals.length` sub-reporta — usa o
          // total real da etapa quando o backend o envia.
          count: stage.totalCount ?? stage.deals.length,
          totalValue: stage.deals.reduce(
            (sum, d) => sum + dealNumericValue(d.value),
            0,
          ),
        };
      }
    }
    return {
      name: "Todos",
      color: "var(--brand-primary)",
      count: totalDeals,
      totalValue: filteredStages.reduce(
        (sum, s) =>
          sum +
          s.deals.reduce((a, d) => a + dealNumericValue(d.value), 0),
        0,
      ),
    };
  }, [filteredStages, selectedStageId, totalDeals]);

  // Restante da etapa visível (ou soma em Todos). Badge 874 + 6 cards
  // no DOM = ainda há página no servidor, mesmo se `hasMore` vier false.
  const queueRemaining = useMemo(() => {
    const source = selectedStageId
      ? filteredStages.filter((s) => s.id === selectedStageId)
      : filteredStages;
    return source.reduce((sum, s) => {
      const total = s.totalCount ?? s.deals.length;
      return sum + Math.max(0, total - s.deals.length);
    }, 0);
  }, [filteredStages, selectedStageId]);
  const canLoadMoreServer = Boolean(queueHasMore) && queueRemaining > 0;

  // ────────────────────────────────────────────────────────────────────
  // Navegacao por teclado — faz o Sales Hub ser 100% navegavel sem sair
  // da tela:
  //   ↑ / ↓  →  navega entre cards da Fila (seleciona o deal anterior/proximo)
  //   ← / →  →  navega entre etapas do funil (filtra a Fila)
  //   Esc    →  deseleciona o deal ativo (volta ao estado inicial)
  //
  // Ignora a key se o foco estiver em input/textarea/contenteditable pra
  // nao conflitar com a busca da fila ou com a digitacao no Composer.
  // Root do container marcado com ref + tabIndex=-1 pra garantir foco
  // programatico quando o usuario clica em qualquer area do hub.
  // ────────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!t || !(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (t.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      // Protege contra navegacao quando o hub nao esta no viewport.
      if (!rootRef.current) return;

      if (e.key === "Escape") {
        if (detailsOpen) {
          e.preventDefault();
          setDetailsOpen(false);
          return;
        }
        if (activeDealId) {
          e.preventDefault();
          handleDeselectDeal();
        }
        return;
      }

      // ↑ / ↓ — navega entre cards da fila
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        if (sortedDeals.length === 0) return;
        e.preventDefault();
        const curIdx = sortedDeals.findIndex((d) => d.id === activeDealId);
        const step = e.key === "ArrowDown" ? 1 : -1;
        const nextIdx =
          curIdx < 0
            ? e.key === "ArrowDown"
              ? 0
              : sortedDeals.length - 1
            : Math.max(0, Math.min(sortedDeals.length - 1, curIdx + step));
        const nextDeal = sortedDeals[nextIdx];
        if (nextDeal) handleSelectDeal(nextDeal.id);
        return;
      }

      // ← / → — navega entre etapas do funil.
      // Inclui a opcao "Todas" (id=null) como posicao 0; as etapas em
      // `filteredStages` ocupam posicoes 1..N. Mantem a selecao ciclica
      // dentro desse intervalo.
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const ids: (string | null)[] = [null, ...filteredStages.map((s) => s.id)];
        const curIdx = ids.findIndex((id) => id === selectedStageId);
        const step = e.key === "ArrowRight" ? 1 : -1;
        const nextIdx = Math.max(0, Math.min(ids.length - 1, curIdx + step));
        if (nextIdx === curIdx) return;
        e.preventDefault();
        handleSelectStage(ids[nextIdx] ?? null);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    activeDealId,
    detailsOpen,
    handleDeselectDeal,
    handleSelectDeal,
    handleSelectStage,
    sortedDeals,
    filteredStages,
    selectedStageId,
  ]);

  const hubChromeCompact = false;

  // Board/etapa ainda sem dados: UM loading na área de conteúdo. Desenhar o
  // ribbon e o header da fila aqui pintava "Todos 0" / "…" — preview falso do
  // layout final. Os gates que alimentam `chromePending` são todos limitados
  // (snapshot, erro ou hold de 50ms), então isto nunca fica preso.
  if (chromePending) {
    return <AppLoading variant="inline" className="h-full min-h-0 flex-1" />;
  }

  return (
    // Root transparente: deixa o mesh lavanda do v2-screen aparecer
    // (mesmo contraste coluna/card do kanban). Estrutura split preservada.
    <div
      ref={rootRef}
      className="flex h-full flex-col bg-transparent"
      tabIndex={-1}
    >
      <StageRibbon
        stages={funnelStages}
        selectedStageId={selectedStageId}
        onSelectStage={handleSelectStage}
        totalDeals={totalDeals}
        compact={hubChromeCompact}
      />

      <div
        className={cn(
          "min-h-0 flex-1 overflow-hidden",
          // Grid estável (evita flex↔grid) + transition de colunas ao
          // abrir/fechar chat ou aside — sem thrash nos cards da fila.
          // Sempre split no desktop (fila ~300px + chat): evita cards
          // “gigantes” na 1ª abertura / sem deal selecionado.
          "grid grid-cols-1 grid-rows-[minmax(0,1fr)] gap-3 md:grid-rows-1 md:transition-[grid-template-columns] md:duration-[720ms] md:ease-[cubic-bezier(0.22,1,0.36,1)] md:motion-reduce:transition-none",
          // 3 tracks sempre no md p/ interpolar grid-template-columns no
          // open/close do aside sem thrash. A 3ª fechada é `minmax(0px,0px)`
          // e não `0fr`: track de tipo diferente da aberta não interpola —
          // o browser anima discreto e a coluna salta na metade do tempo.
          // Aberta é 360px fixo (mesma largura fixa do aside) para que o
          // fechamento só clipe a coluna, sem re-layoutar o CRM inteiro.
          // Entrada e saída: mesma curva, um pouco mais lenta/fluida que o
          // drawer global (500ms / power3.out).
          detailsOpen && activeDeal
            ? "md:grid-cols-[300px_minmax(0,1fr)_minmax(360px,360px)]"
            : "md:grid-cols-[300px_minmax(0,1fr)_minmax(0px,0px)]",
        )}
      >
        {/* Coluna 1 — Fila: superfície igual `KanbanColumn`
            (`glass-bg` semitransparente sobre lavanda + cards `glass-bg-strong`). */}
        <div
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md",
            activeDeal
              ? "hidden min-w-0 md:flex"
              : "min-w-0",
          )}
        >
          <header className="relative shrink-0 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg-strong)] px-3 py-2.5 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <h3 className="min-w-0 truncate font-display text-[14px] font-bold tracking-tight text-[var(--text-primary)]">
                  {queueStageHeader.name}
                </h3>
                <span
                  className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 font-display text-[11px] font-bold text-white"
                  style={{ background: queueStageHeader.color }}
                >
                  {queueStageHeader.count}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <DealQueueSortMenu
                  sortMode={sortMode}
                  onSortModeChange={onSortModeChange}
                  iconOnly
                />
              </div>
            </div>
            <div
              className="mt-1.5 h-[2px] w-full rounded-full opacity-90"
              style={{ backgroundColor: queueStageHeader.color }}
              aria-hidden
            />
            <p className="mt-1.5 text-[11px] tabular-nums text-[var(--text-muted)]">
              {formatCurrency(queueStageHeader.totalValue)}
            </p>
          </header>

          <DealQueue
            deals={sortedDeals}
            stages={filteredStages}
            activeDealId={activeDealId}
            onSelectDeal={handleSelectDeal}
            onDeselect={handleDeselectDeal}
            recentlyMovedDealId={recentlyMovedDealId}
            sortMode={sortMode}
            hasMoreServer={canLoadMoreServer}
            remainingCount={queueRemaining}
            loadingMore={queueLoadingMore}
            isLoading={chromePending}
            onLoadMore={() => onQueueLoadMore?.(selectedStageId)}
            selectedStageId={selectedStageId}
            stageSwitchToken={stageSwitchToken}
            pipelineId={pipelineId}
            statusFilter={statusFilter}
            onMoved={handleDealMoved}
            onOpenFullDeal={onOpenFullDeal}
          />
        </div>

        {/* Coluna 2 — Chat. Sem deal: empty state (fila continua ~300px).
            Com deal: conversa; com CRM: [fila | chat | aside].
            No mobile, detalhes abertos escondem o chat p/ a aside ocupar a tela. */}
        <div
          onMouseLeave={handleChatPaneMouseLeave}
          className={cn(
            "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] shadow-[var(--glass-shadow-sm)] backdrop-blur-md",
            // Mobile: sem deal a fila ocupa a tela; com deal o chat entra.
            !activeDeal && "hidden md:flex",
            detailsOpen && activeDeal && "max-md:hidden",
          )}
        >
          {activeDeal ? (
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--glass-border-subtle)] bg-[var(--glass-bg)] px-2 py-1.5 md:hidden">
              <button
                type="button"
                onClick={handleDeselectDeal}
                className="flex shrink-0 items-center gap-1 rounded-[var(--radius-md)] px-1.5 py-1 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
              >
                <IconArrowLeft size={14} stroke={2} />
                Voltar
              </button>
              <span className="min-w-0 truncate text-[12px] text-[var(--text-muted)]">
                {activeDeal.contact?.name ?? activeDeal.title ?? ""}
              </span>
            </div>
          ) : null}
          {!activeDealId ? (
            <SalesHubChatEmptyState
              title="Selecione um negócio"
              subtitle="Escolha um card na fila à esquerda para abrir a conversa."
            />
          ) : !activeDeal && !detailDeal ? (
            <ConversationPaneSkeleton />
          ) : !activeContactId ? (
            <SalesHubChatEmptyState
              title="Deal sem contato"
              subtitle="Este deal nao tem contato vinculado — atribua um contato para iniciar a conversa."
            />
          ) : conversationsLoading ? (
            <ConversationPaneSkeleton />
          ) : !activeConversation ? (
            <SalesHubChatEmptyState
              title="Sem conversa aberta"
              subtitle={`${activeDeal?.contact?.name ?? detailDeal?.name ?? "Este contato"} ainda nao tem nenhuma conversa. Abra uma nova a partir do Inbox.`}
            />
          ) : (
            <SalesHubChat
              key={activeConversation.id}
              conversationId={activeConversation.id}
              conversationStatus={activeConversation.status}
              lastInboundAt={activeConversation.lastInboundAt ?? null}
              contactId={activeContactId}
              contactName={
                activeDeal?.contact?.name ??
                activeDeal?.title ??
                detailDeal?.name ??
                ""
              }
              contactPhone={
                activeDeal?.contact?.phone ?? detailDeal?.phone ?? null
              }
              contactChannel={
                activeConversation.channel ?? activeDeal?.channel ?? null
              }
              dealId={activeDeal?.id ?? activeDealId ?? ""}
              pipelineId={pipelineId}
              onConversationReopened={handleConversationReopened}
              headerActionsSlot={
                <>
                  <WhatsappCallChip
                    conversationId={activeConversation.id}
                    channel={
                      activeConversation.channel ?? activeDeal?.channel ?? null
                    }
                    hasCalling={conversationHasCallingHint(activeConversation)}
                    contactName={
                      activeDeal?.contact?.name ??
                      activeDeal?.title ??
                      detailDeal?.name ??
                      ""
                    }
                  />
                  {contactConversations.length > 1 ? (
                    <TooltipHost label="Conversas do contato" side="bottom">
                      <button
                        type="button"
                        aria-label="Conversas do contato"
                        onClick={() => setConvListOpen(true)}
                        className="flex size-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
                      >
                        <MessagesIcon className="size-4" strokeWidth={1.7} />
                      </button>
                    </TooltipHost>
                  ) : null}
                  <TooltipHost label="Detalhes do negócio" side="bottom">
                    <button
                      type="button"
                      aria-label="Detalhes do negócio"
                      aria-pressed={detailsOpen}
                      onClick={() => setDetailsOpen((v) => !v)}
                      className={cn(
                        "flex size-8 items-center justify-center rounded-full transition-colors",
                        detailsOpen
                          ? "bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
                          : "text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]",
                      )}
                    >
                      <Briefcase className="size-4" strokeWidth={1.7} />
                    </button>
                  </TooltipHost>
                  <ConversationActionsMenu
                    conversationId={activeConversation.id}
                    conversationNumber={activeConversation.number}
                    contactId={activeContactId}
                    contactName={
                      activeDeal?.contact?.name ??
                      detailDeal?.name ??
                      null
                    }
                    isResolved={activeConversation.status === "RESOLVED"}
                    assigneeId={activeConversation.assignedToId ?? null}
                    onResolved={() => {
                      queryClient.invalidateQueries({
                        queryKey: [
                          "saleshub-contact-conversations",
                          activeContactId,
                        ],
                      });
                    }}
                    onReopenNewConversation={handleConversationReopened}
                  />
                </>
              }
            />
          )}
        </div>

        {/* Coluna 3 — CRM inline (DealDetailPanel crmOnly): comprime o chat,
            sem Sheet/scrim. Abre via briefcase ou mouse leave na borda direita.
            Mantida montada com deal ativo p/ slide-out (track 0 + transform)
            antes do colapso; no mobile some do fluxo quando fechada. */}
        {activeDeal ? (
          <aside
            className={cn(
              "min-h-0 min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border bg-[var(--glass-bg-modal)] backdrop-blur-md",
              // Mesmos tokens da gaveta de Configurações: desliza 100px,
              // abre com power3.out e fecha mais curto. `border-color`
              // e `box-shadow` ficam FORA da lista de transição: repintar
              // sombra a cada frame de um painel com backdrop-blur é o que
              // mais custa aqui, e a troca instantânea some no movimento.
              // Largura fixa em vez de `min-width` animada: a coluna que
              // encolhe passa a só clipar o painel, sem reflow do CRM.
              // Só `transform` (sem opacity): ease-out no fade esvaziava o
              // painel no começo da saída e deixava o container “fantasma”.
              "md:w-[360px] md:shrink-0",
              "md:transition-transform md:duration-[720ms] md:ease-[cubic-bezier(0.22,1,0.36,1)] md:motion-reduce:transition-none",
              detailsOpen
                ? "flex border-[var(--glass-border-subtle)] shadow-[var(--glass-shadow-sm)] md:translate-x-0"
                : "pointer-events-none hidden border-transparent shadow-none md:flex md:translate-x-[100px]",
            )}
            aria-label="Detalhes do negócio"
            aria-hidden={!detailsOpen}
            onMouseEnter={handleAsideMouseEnter}
            onMouseLeave={handleAsideMouseLeave}
          >
            {/* Sem chrome branco: pin/X vão no hero azul do DealDetailPanel. */}
            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--glass-bg)]">
              <DealDetailPanel
                crmOnly
                isOpen={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                deal={detailDeal}
                // Paridade com o aside do Kanban: chips + "+" no canto
                // direito, para gerenciar tags sem sair do Flow.
                tagsSlot={(() => {
                  const allTags = activeDeal.tags ?? [];
                  return (
                    <div className="flex w-full min-w-0 flex-wrap items-center gap-1.5">
                      {allTags.slice(0, 2).map((t) => (
                        <TooltipGlass key={t.id} label={t.name} side="top">
                          <TagChip
                            name={t.name}
                            color={t.color}
                            className="min-w-0 max-w-full shrink"
                          />
                        </TooltipGlass>
                      ))}
                      <span className="ml-auto shrink-0 pl-1">
                        <TagsPopover
                          dealId={activeDeal.id}
                          currentTags={allTags}
                          pipelineId={pipelineId}
                          statusFilter={statusFilter}
                          trigger={
                            <span className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-white/35 px-2.5 py-0.5 font-display text-[11px] font-semibold text-white/70 transition-colors hover:border-white hover:text-white">
                              <Plus size={10} />
                              {allTags.length === 0 ? "Adicionar" : ""}
                            </span>
                          }
                        />
                      </span>
                    </div>
                  );
                })()}
                customFieldsSlot={customFieldsSlot}
                contactFieldConfigSlot={contactFieldConfigSlot}
                dealFieldConfigSlot={dealFieldConfigSlot}
                headerActionsSlot={
                  <>
                    <TooltipHost
                      label={
                        asidePinned
                          ? "Desafixar painel (fecha ao trocar de deal)"
                          : "Fixar painel (permanece ao trocar de deal)"
                      }
                      side="bottom"
                    >
                      <button
                        type="button"
                        aria-label={
                          asidePinned ? "Desafixar painel" : "Fixar painel"
                        }
                        aria-pressed={asidePinned}
                        onClick={toggleAsidePinned}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-[var(--radius-md)] transition-colors",
                          asidePinned
                            ? "bg-sky-400/20 text-sky-300"
                            : "text-sky-300/90 hover:bg-white/10 hover:text-sky-200",
                        )}
                      >
                        {asidePinned ? (
                          <PinFilled className="size-4" strokeWidth={1.7} />
                        ) : (
                          <Pin className="size-4" strokeWidth={1.7} />
                        )}
                      </button>
                    </TooltipHost>
                    <button
                      type="button"
                      aria-label="Fechar"
                      onClick={() => setDetailsOpen(false)}
                      className="flex size-8 items-center justify-center rounded-[var(--radius-md)] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                    >
                      <X className="size-4" />
                    </button>
                  </>
                }
              />
            </div>
          </aside>
        ) : null}
      </div>

      <Dialog open={convListOpen} onOpenChange={setConvListOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Conversas do contato</DialogTitle>
          </DialogHeader>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {contactConversations.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-[var(--radius-md)] px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--glass-bg-strong)]",
                    c.id === activeConversation?.id &&
                      "bg-[var(--color-enterprise-bg)] font-medium text-[var(--brand-primary)]",
                  )}
                  onClick={() => {
                    setPickedConversationId(c.id);
                    setConvListOpen(false);
                  }}
                >
                  <span className="font-medium capitalize">{c.channel}</span>
                  <span className="text-[var(--text-muted)]">
                    {" "}
                    · {c.status}
                  </span>
                  <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
                    {new Date(c.updatedAt).toLocaleString("pt-BR")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
}
