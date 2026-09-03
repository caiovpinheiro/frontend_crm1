"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";

import {
  IconAntenna,
  IconArrowsExchange,
  IconCheckbox,
  IconChevronDown,
  IconDotsVertical,
  IconDownload,
  IconMenu2,
  IconPencil,
  IconPlus,
  IconSettings,
  IconTrophy,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  pathForPipelineView,
  writePipelineViewPreference,
} from "@/lib/pipeline-view-preference";
import {
  SEARCH_DEBOUNCE_MS,
  normalizeSearchQuery,
} from "@/lib/search-query";

import { AppLoading } from "@/components/crm/app-loading";
import { NavRailSpacer } from "@/components/crm/nav-rail-spacer";
import { PipelineHeader } from "@/components/crm/pipeline-header";
import { PageTourButton } from "@/features/product-tour";
import { KanbanColumn } from "@/components/crm/kanban-column";
import { DealCard } from "@/components/crm/deal-card";
import { ScrollMap } from "@/components/crm/scroll-map";
import { ScrollMapVertical } from "@/components/crm/scroll-map-vertical";
import { DealDetailPanel, type DealDetail } from "@/components/crm/deal-detail-panel";
import { DealProductsSection, DealQuotasSection } from "@/components/pipeline/deal-detail/sidebar";
import { CallHistoryList } from "@/features/softphone/components/call-history-list";
import { ActivitiesPanel } from "@/components/pipeline/deal-workspace/panels/activities";
import { DealCallButton } from "@/features/softphone/components/deal-call-button";
import { ContactEditDialog } from "@/components/crm/contact-edit-dialog";
import { FieldConfigPanel } from "@/components/crm/fields/field-config-panel";
import { Chip } from "@/components/crm/chip";
import { TagChip } from "@/components/crm/tag-chip";
import { UserAvatar } from "@/components/crm/user-avatar";

import {
  toKanbanColumns,
  type KanbanColumnView,
} from "@/features/pipeline-v2/adapters";
import {
  ExportPanel,
  ImportPanel,
  useImportExportBump,
  type ExportScope,
} from "@/features/pipeline-v2/import-export";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { pageActionsMenuTriggerClass } from "@/components/crm/page-toolbar";
import { avatarInitials } from "@/features/inbox-v2/adapters";
import { useContactSidebar } from "@/features/inbox-v2/hooks";
import {
  useBoard,
  useBoardFiltered,
  BOARD_PAGE_SIZE,
  useDealDetail,
  useEntityViewers,
  useMoveDeal,
  usePipelineRealtime,
  usePipelineUrlSync,
  usePipelineLossReasons,
  usePipelines,
  useTeamUsers,
  type MoveVars,
} from "@/features/pipeline-v2/hooks";
import { DealViewersStack } from "@/components/crm/deal-viewers-stack";
import { dealDetailKey } from "@/features/pipeline-v2/hooks/use-deal-detail";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchBoardDealIds, updateDeal } from "@/features/pipeline-v2/api";
import { createContact } from "@/features/directory-v2/api";
import { personNameFromDealTitle, sanitizeContactName } from "@/lib/display-name";
import { useCan, useMyPermissions } from "@/hooks/use-my-permissions";
import { useStuckTimeout } from "@/hooks/use-stuck-timeout";
import { RequirePermission } from "@/components/auth/require-permission";
import { BulkActionsBar } from "@/components/pipeline/bulk-actions-bar";
import type { BulkScopeContext } from "@/components/pipeline/bulk-edit-fields-dialog";
import { LossReasonDialog } from "@/components/pipeline/loss-reason-dialog";
import type {
  BoardDealDto,
  BoardSortParam,
  BoardStageDto,
  StatusFilter,
} from "@/features/pipeline-v2/api";
import {
  AddDealDialog,
  AssigneePopover,
  DealActionsMenu,
  DealCardTagsTrigger,
  DealNotesTab,
  DealTimelineTab,
  InlineEditText,
  MoveToStageMenu,
  PipelineSwitcher,
  StagePicker,
  TagsPopover,
  WinButton,
  DealChatBindingHost,
} from "@/features/pipeline-v2/extras";
import { PipelineChannelsModal } from "@/features/pipeline-v2/extras/pipeline-channels-modal";
import { computePopoverPosition } from "@/features/pipeline-v2/extras/use-portal-popover";
import { ContactTagsPopover } from "@/features/inbox-v2/extras/contact-tags-popover";
import { PipelineSearchFilterBar } from "@/components/pipeline/kanban-filters/v2/search-filter-bar";
import { PipelinePeriodCalendar } from "@/components/pipeline/kanban-filters/pipeline-period-calendar";
import { fetchFilterOptions } from "@/components/pipeline/kanban-filters/api";
import { useKanbanFilters } from "@/components/pipeline/kanban-filters/use-kanban-filters";
import { usePipelineSearchSort } from "@/components/pipeline/kanban-filters/use-pipeline-search-sort";
import {
  isEmptyFilters,
  hasServerSideFilters,
  type AdvancedDealFilters,
} from "@/components/pipeline/kanban-filters/types";

/**
 * Modelo Kommo: ganho/perdido são ESTÁGIOS fixos no fim do funil (não
 * mais um filtro por aba). O board sempre carrega com status "ALL" —
 * deals fechados vivem nas colunas Ganho/Perdido e os abertos nas demais
 * (Deal.status é sincronizado pelo backend ao mover entre colunas).
 */
const BOARD_STATUS: StatusFilter = "ALL";

/**
 * Props opcionais — usadas para reaproveitar o Kanban dentro do
 * segmento `/v2/*` (injeta o NavRailV2 com hrefs novos). Sem nada
 * passado, mantém o `<NavRail />` legado.
 */
interface KanbanV2ClientPageProps {
  navRail?: React.ReactNode;
  /**
   * Quando informado, o toggle de visão (Pipeline/Lista) do header
   * navega para esta rota ao selecionar "Lista". Usado pelo segmento
   * `/v2/pipeline` (-> `/v2/pipeline/list`). Sem isso, o toggle de
   * lista fica inerte (legado `(v2)/pipeline/kanban-v2`).
   */
  listHref?: string;
}

export default function KanbanV2ClientPage({
  navRail,
  listHref,
}: KanbanV2ClientPageProps = {}) {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === "authenticated";

  useEffect(() => {
    writePipelineViewPreference("kanban");
  }, []);

  const [activeDealId, setActiveDealId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URL(window.location.href).searchParams.get("deal");
  });

  // Deep-link: negócio aberto em `?deal=<número>`. History API (sem RSC refetch).
  // Interno = CUID; URL = só número. Nunca escrever CUID novo na query.
  const setActiveDeal = useCallback((id: string | null, num?: number | null) => {
    setActiveDealId(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (!id) {
      if (!url.searchParams.has("deal")) return;
      url.searchParams.delete("deal");
      window.history.replaceState(window.history.state, "", url.toString());
      return;
    }
    if (num == null) return;
    const urlVal = String(num);
    if (url.searchParams.get("deal") === urlVal) return;
    url.searchParams.set("deal", urlVal);
    window.history.pushState(window.history.state, "", url.toString());
  }, []);

  // URL no primeiro paint do cliente (inbox → ?deal=). useLayoutEffect
  // cobre hydrate SSR sem esperar o frame do useEffect — evita spinner
  // no kanban e depois outro no overlay.
  useLayoutEffect(() => {
    const d = new URL(window.location.href).searchParams.get("deal");
    if (d) setActiveDealId((cur) => cur ?? d);
  }, []);

  // Voltar/avançar do navegador atualiza o negócio aberto.
  useEffect(() => {
    function onPop() {
      setActiveDealId(new URL(window.location.href).searchParams.get("deal"));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const [addStage, setAddStage] = useState<{ id: string; name: string } | null>(
    null,
  );
  const canChangeStage = useCan("deal:change_stage");
  const { filters, setFilters, patch: patchFilters, clear: clearFilters } = useKanbanFilters();
  // Busca (`?q=`) e ordenação (`?sort=`) na URL — link copiável reproduz a
  // visão. Ordenação: `created_*`/`interaction_*` são delegados ao backend
  // (ver `boardSort`), porque ordenar só os deals já carregados (100/coluna)
  // deixava cards presos em páginas posteriores. `name_*` segue client-side
  // (o backend ainda não expõe esses campos como sort).
  const { search, setSearch, sortKey, setSortKey } = usePipelineSearchSort();
  const kebabBtnRef = useRef<HTMLButtonElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const boardWrapperRef = useRef<HTMLDivElement>(null);

  // Kebab menu e modal de import/export
  const [kebabOpen, setKebabOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState<"import" | "export" | null>(null);
  const [channelsModalOpen, setChannelsModalOpen] = useState(false);
  const bump = useImportExportBump();

  const status = BOARD_STATUS;
  const pipelinesQuery = usePipelines(isAuthenticated);
  const pipelines = pipelinesQuery.data;
  // URL `?pipeline=<number>` + LS interno; nunca CUID/slug na query.
  const { pipelineId, setPipelineId } = usePipelineUrlSync(pipelines);

  // Board aceita number público (`?pipeline=8`) — não espera a lista
  // resolver o CUID. Quando o funil selecionado tem `number`, a key
  // permanece o mesmo dígito e não refetcha.
  const boardLookupId = useMemo(() => {
    const selectedNumber = pipelines?.find((p) => p.id === pipelineId)?.number;
    if (typeof selectedNumber === "number" && Number.isFinite(selectedNumber)) {
      return String(selectedNumber);
    }
    if (typeof window !== "undefined") {
      const urlKey = new URL(window.location.href).searchParams.get("pipeline");
      if (urlKey && /^\d+$/.test(urlKey)) return urlKey;
    }
    return pipelineId;
  }, [pipelines, pipelineId]);

  const boardSort = useMemo<BoardSortParam | undefined>(() => {
    if (sortKey === "created_newest") return { field: "createdAt", direction: "desc" };
    if (sortKey === "created_oldest") return { field: "createdAt", direction: "asc" };
    if (sortKey === "interaction_newest") return { field: "lastInteraction", direction: "desc" };
    if (sortKey === "interaction_oldest") return { field: "lastInteraction", direction: "asc" };
    return undefined;
  }, [sortKey]);

  // ── Filtros server-side (varre todo o pipeline, não só os 100 carregados) ──
  // O GET /board pagina 100 deals/coluna e ignora filtros avançados (origem,
  // tags, datas, etc.). Quando há qualquer critério ativo, trocamos pelo
  // POST /board com `filters` — mesma engine do backend usada na edição em massa.
  const rawSearch = (filters.search ?? search).trim();
  const [debouncedSearch, setDebouncedSearch] = useState(rawSearch);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(rawSearch), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [rawSearch]);

  const mergedFilters = useMemo(() => {
    const f: AdvancedDealFilters = { ...filters };
    const q = normalizeSearchQuery(debouncedSearch);
    if (q) f.search = q;
    else delete f.search;
    return f;
  }, [filters, debouncedSearch]);

  const hasServerBoard = hasServerSideFilters(mergedFilters);

  // "Carregar mais" por coluna: stageId → extras cumulativos além da
  // página inicial (10). Com ≥1 expansão o board passa a vir do POST
  // /board (única rota que aceita offset) — ver `useBoard`.
  const [boardExtraByStage, setBoardExtraByStage] = useState<Record<string, number>>({});
  const [loadingMoreStageId, setLoadingMoreStageId] = useState<string | null>(null);

  const boardNormal = useBoard({
    pipelineId: boardLookupId,
    status,
    sort: boardSort,
    enabled: isAuthenticated && !hasServerBoard,
    perStage: BOARD_PAGE_SIZE,
    offsetByStage: boardExtraByStage,
  });
  const boardFiltered = useBoardFiltered({
    pipelineId: boardLookupId,
    status,
    filters: mergedFilters,
    sort: boardSort,
    enabled: isAuthenticated && hasServerBoard,
  });
  const board = hasServerBoard ? boardFiltered.data ?? [] : boardNormal.data ?? [];

  usePipelineRealtime(isAuthenticated);

  const moveDeal = useMoveDeal(pipelineId, status);

  // ── Tabulação de motivo da perda ─────────────────────────────────
  // Só pede motivo se a etapa Perdido do funil estiver com tabulação
  // Ativa (pipelines.lossReasonRequired). Cancelar = não move.
  const [pendingLostMove, setPendingLostMove] = useState<MoveVars | null>(null);

  // Key compartilhada com LossReasonDialog / actions-menu / bulk-bar.
  const lossMetaQuery = usePipelineLossReasons(pipelineId, {
    enabled: !!pendingLostMove,
  });

  useEffect(() => {
    if (!pendingLostMove) return;
    if (lossMetaQuery.isPending) return;
    if (!lossMetaQuery.data?.lossReasonRequired) {
      moveDeal.mutate(pendingLostMove);
      setPendingLostMove(null);
    }
  }, [pendingLostMove, lossMetaQuery.isPending, lossMetaQuery.data, moveDeal]);

  const requestMove = useCallback(
    (vars: MoveVars) => {
      if (vars.fromStageId !== vars.toStageId && !canChangeStage) {
        toast.error("Sem permissão para mover negócios entre etapas.");
        return;
      }
      const target = board.find((s) => s.id === vars.toStageId);
      // Cross-pipeline: quando o estágio destino não pertence ao board
      // atual, não temos como saber isLost/lossReasonRequired sem uma
      // requisição extra. Deixamos o backend validar (LOST_REASON_REQUIRED
      // → toast de erro) e o operador tenta novamente pelo funil destino.
      if (target?.isLost && vars.fromStageId !== vars.toStageId) {
        setPendingLostMove(vars);
        return;
      }
      moveDeal.mutate(vars);
    },
    [board, moveDeal, canChangeStage],
  );

  // ── Seleção em massa (resgatada da versão antiga) ────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /**
   * Modo seleção global: quando ativo (via kebab "Selecionar"), todos os
   * cards exibem o checkbox e o conteúdo desloca para a direita. Sair do
   * modo limpa a seleção atual.
   */
  const [selectionMode, setSelectionMode] = useState(false);
  /** Etapas cujo header marcou o recorte inteiro (não só os cards carregados). */
  const [fullySelectedStageIds, setFullySelectedStageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectingStageId, setSelectingStageId] = useState<string | null>(null);
  // Só busca /api/users quando a barra de massa precisa (modo seleção).
  // AssigneePopover/filters carregam sob demanda com a mesma query key.
  const { data: teamUsers = [] } = useTeamUsers(
    isAuthenticated && (selectionMode || selectedIds.size > 0),
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setFullySelectedStageIds((prev) => {
      if (prev.size === 0) return prev;
      const stage = board.find((s) => s.deals.some((d) => d.id === id));
      if (!stage || !prev.has(stage.id)) return prev;
      const next = new Set(prev);
      next.delete(stage.id);
      return next;
    });
  }, [board]);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setFullySelectedStageIds(new Set());
  }, []);

  /**
   * Checkbox do header da coluna: busca TODOS os IDs da etapa no
   * servidor (mesmo recorte do board) e marca/desmarca o conjunto.
   * Seleção parcial continua na vista Lista.
   */
  const toggleSelectAllInStage = useCallback(
    async (stageId: string) => {
      if (!pipelineId || selectingStageId) return;
      setSelectingStageId(stageId);
      try {
        const { ids, capped } = await fetchBoardDealIds({
          pipelineId,
          stageId,
          status,
          filters: mergedFilters,
        });
        if (ids.length === 0) {
          toast.error("Nenhum negócio nesta etapa para selecionar.");
          return;
        }
        if (capped) {
          toast.message(
            `Seleção limitada a ${ids.length.toLocaleString("pt-BR")} negócios desta etapa.`,
          );
        }
        let turnedOff = false;
        setSelectedIds((prev) => {
          const allOn = ids.every((id) => prev.has(id));
          turnedOff = allOn;
          const next = new Set(prev);
          if (allOn) {
            for (const id of ids) next.delete(id);
          } else {
            for (const id of ids) next.add(id);
          }
          return next;
        });
        setFullySelectedStageIds((prev) => {
          const next = new Set(prev);
          if (turnedOff) next.delete(stageId);
          else next.add(stageId);
          return next;
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao selecionar a etapa.");
      } finally {
        setSelectingStageId(null);
      }
    },
    [mergedFilters, pipelineId, selectingStageId, status],
  );

  // Limpa a seleção ao trocar de pipeline / recorte — os IDs não
  // batem com outro funil ou filtro.
  useEffect(() => {
    setSelectedIds(new Set());
    setFullySelectedStageIds(new Set());
  }, [pipelineId, status, mergedFilters]);

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Options de filtro: só quando o modal abre ou já há filtro ativo.
  const filterOptionsQuery = useQuery({
    queryKey: ["kanban-filter-options"],
    queryFn: fetchFilterOptions,
    enabled: isAuthenticated && (filterPanelOpen || !isEmptyFilters(filters)),
    staleTime: 5 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
  const filterOptions = filterOptionsQuery.data ?? null;
  const filterOptionsLoading = filterOptionsQuery.isLoading;

  // Aplica filtros client-side ANTES de virar colunas.
  const filteredBoard = useMemo(() => {
    // Board vindo do POST /board já foi filtrado no servidor (origem, busca,
    // tags, datas, etc.). Filtros só-cliente (ex.: faixa de valor) ainda
    // passam pelo bloco abaixo.
    if (hasServerBoard) {
      const vMin = filters.valueFrom != null ? Number(filters.valueFrom) : null;
      const vMax = filters.valueTo != null ? Number(filters.valueTo) : null;
      const hasValue = vMin !== null || vMax !== null;
      if (!hasValue) return board;
      return board.map((stage) => {
        const deals = stage.deals.filter((d) => {
          const val = Number(d.value) || 0;
          if (vMin !== null && val < vMin) return false;
          if (vMax !== null && val > vMax) return false;
          return true;
        });
        return { ...stage, deals, totalCount: deals.length };
      });
    }

    const queries = [filters.search, search]
          .map((v) => (v ?? "").trim().toLowerCase())
          .filter((v) => v.length > 0);
    const hasSearch = queries.length > 0;
    const hasOwner = (filters.ownerIds?.length ?? 0) > 0;
    const hasTag = (filters.tagIds?.length ?? 0) > 0;
    const hasStage = (filters.stageIds?.length ?? 0) > 0;
    const lostReasonSet = (filters.lostReasons?.length ?? 0) > 0
      ? new Set(filters.lostReasons)
      : null;
    const hasLostReason = lostReasonSet !== null;
    const vMin = filters.valueFrom != null ? Number(filters.valueFrom) : null;
    const vMax = filters.valueTo != null ? Number(filters.valueTo) : null;
    const hasValue = vMin !== null || vMax !== null;

    const noFilters =
      !hasSearch && !hasOwner && !hasTag && !hasStage && !hasValue && !hasLostReason && isEmptyFilters(filters);
    // Quando há QUALQUER filtro client-side ativo o `totalCount` que veio
    // do backend (não filtrado) precisa ser sobrescrito pelo número real
    // de deals visíveis — caso contrário o badge da coluna fica preso no
    // total original e parece que o filtro/busca não funcionou.
    const overrideCount = !noFilters;

    const filtered = noFilters
      ? board
      : board
          .filter((stage) => !hasStage || (filters.stageIds ?? []).includes(stage.id))
          .map((stage) => {
            const deals = stage.deals.filter((d) => {
              if (hasOwner && (!d.owner?.id || !(filters.ownerIds ?? []).includes(d.owner.id))) return false;
              if (hasTag) {
                const ids = (d.tags ?? []).map((t) => t.id);
                if (!(filters.tagIds ?? []).some((id) => ids.includes(id))) return false;
              }
              if (hasSearch) {
                const hay = [d.title, d.contact?.name, d.contact?.email, d.contact?.phone]
                  .filter(Boolean).join(" ").toLowerCase();
                if (!queries.every((q) => hay.includes(q))) return false;
              }
              if (hasValue) {
                const val = Number(d.value) || 0;
                if (vMin !== null && val < vMin) return false;
                if (vMax !== null && val > vMax) return false;
              }
              if (lostReasonSet && !(d.lostReason && lostReasonSet.has(d.lostReason))) {
                return false;
              }
              return true;
            });
            return {
              ...stage,
              deals,
              totalCount: overrideCount ? deals.length : stage.totalCount,
            };
          });

    // Ordenação dos cards dentro de cada coluna.
    //
    // `default` / `created_*` / `interaction_*` → não fazem nada aqui:
    //   - `default` mantém a ordem `position asc` que veio do backend.
    //   - `created_newest` / `created_oldest` JÁ vêm ordenados do
    //     servidor (param `sort=createdAt&direction=...` em `useBoard`).
    //   - `interaction_newest` / `interaction_oldest` JÁ vêm ordenados
    //     do servidor (param `sort=lastInteraction&direction=...`),
    //     cobrindo todos os deals da coluna e não só os 100 carregados.
    //
    // `name_*` continua client-side porque o backend ainda não expõe
    // esse campo como sort do board. Limitação conhecida: ordena só os
    // deals carregados na coluna.
    if (
      sortKey === "default" ||
      sortKey === "created_newest" ||
      sortKey === "created_oldest" ||
      sortKey === "interaction_newest" ||
      sortKey === "interaction_oldest"
    ) {
      return filtered;
    }
    return filtered.map((stage) => {
      const deals = [...stage.deals];
      if (sortKey === "name_az") {
        deals.sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", "pt-BR"));
      } else if (sortKey === "name_za") {
        deals.sort((a, b) => (b.title ?? "").localeCompare(a.title ?? "", "pt-BR"));
      }
      return { ...stage, deals };
    });
  }, [board, filters, search, sortKey, hasServerBoard]);

  // Filtrar stages por stageGrants do usuário (Permissions v2).
  // stageGrants vazio = todas as fases visíveis (sem restrição).
  const { data: myPerms } = useMyPermissions();
  const stageGrantsFiltered = useMemo(() => {
    const stageGrants = myPerms?.stageGrants ?? [];
    if (stageGrants.length === 0) return filteredBoard;
    return filteredBoard.filter((s) => stageGrants.includes(s.id));
  }, [filteredBoard, myPerms?.stageGrants]);

  const columns: KanbanColumnView[] = useMemo(
    () => toKanbanColumns(stageGrantsFiltered),
    [stageGrantsFiltered],
  );

  // ── Contagem total do board ──────────────────────────────────────
  // Soma os `totalCount` das colunas visíveis para o operador não precisar
  // somar etapa por etapa. Com filtro server-side o backend devolve o total
  // real por etapa (groupBy respeitando o filtro), não só os cards carregados.
  const filteredTotal = useMemo(
    () =>
      stageGrantsFiltered.reduce(
        (acc, s) => acc + (s.totalCount ?? s.deals.length),
        0,
      ),
    [stageGrantsFiltered],
  );

  // Total do funil SEM filtro. Vem do board não filtrado, que o React Query
  // mantém em cache mesmo enquanto o board filtrado está ativo — por isso não
  // custa requisição extra. `null` quando o usuário abriu a página já com
  // filtro e o board cheio nunca foi carregado.
  const pipelineTotalUnfiltered = useMemo(() => {
    const data = boardNormal.data;
    if (!data) return null;
    const grants = myPerms?.stageGrants ?? [];
    const stages =
      grants.length > 0 ? data.filter((s) => grants.includes(s.id)) : data;
    return stages.reduce((acc, s) => acc + (s.totalCount ?? s.deals.length), 0);
  }, [boardNormal.data, myPerms?.stageGrants]);

  // `mergedFilters` e não `filters` + `rawSearch`: é o recorte que o board de
  // fato pediu ao servidor (busca já com debounce e mínimo de caracteres).
  const isFiltering = !isEmptyFilters(mergedFilters);

  // Contexto para "selecionar todos que batem no filtro" na edição em massa.
  // Permite editar além dos ~100 cards carregados por coluna: o servidor
  // resolve os IDs a partir do mesmo filtro/visibilidade do board.
  const scopeContext = useMemo<BulkScopeContext | undefined>(() => {
    if (!pipelineId) return undefined;
    const boardForScope = stageGrantsFiltered;
    const pipelineTotal = filteredTotal;
    // Habilita o escopo "etapa" só quando TODA a seleção está numa única etapa.
    let stage: { id: string; name: string; total: number } | null = null;
    if (selectedIds.size > 0) {
      const stagesWithSel = boardForScope.filter((s) =>
        s.deals.some((d) => selectedIds.has(d.id)),
      );
      if (stagesWithSel.length === 1) {
        const s = stagesWithSel[0];
        stage = { id: s.id, name: s.name, total: s.totalCount ?? s.deals.length };
      }
    }
    return { pipelineId, status, filters: mergedFilters, pipelineTotal, stage };
  }, [
    pipelineId,
    stageGrantsFiltered,
    selectedIds,
    mergedFilters,
    status,
    filteredTotal,
  ]);

  // Lookup ownerId / tags reais por dealId. O `Deal` (v0) que chega no
  // renderDeal só tem `owner.name`, não o `ownerId` nem `tagIds`. Esse
  // map evita ter que estender o tipo Deal só para isso. Usa o board
  // ORIGINAL pra nao perder lookup de cards filtrados (caso slot
  // precise consultar mesmo escondido).
  const dealById = useMemo(() => {
    const map = new Map<string, BoardDealDto>();
    for (const stage of board) {
      for (const d of stage.deals) map.set(d.id, d);
    }
    return map;
  }, [board]);

  const { data: dealDetail } = useDealDetail(activeDealId);
  const queryClient = useQueryClient();

  // Expansões "Carregar mais": cada scroll/clique soma +10 na coluna e
  // refaz o board (POST com offsetByStage). Usar `boardNormal.refetch()`
  // — NÃO `refetchQueries({ queryKey: boardKey(pipelineId) })`.
  // `useBoard` chaveia com `boardLookupId` (number público, ex. "8");
  // `pipelineId` é CUID. `exact: true` no CUID não achava a query →
  // clique e auto-scroll pareciam mortos.
  const extrasKey = JSON.stringify(boardExtraByStage);
  const refetchBoard = boardNormal.refetch;
  useEffect(() => {
    if (Object.keys(boardExtraByStage).length === 0) return;
    void refetchBoard().finally(() => setLoadingMoreStageId(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extrasKey]);

  // Troca de funil/status/ordenação/filtro → colunas expandidas voltam a 10.
  useEffect(() => {
    setBoardExtraByStage({});
    setLoadingMoreStageId(null);
  }, [pipelineId, status, sortKey, hasServerBoard]);

  const handleLoadMoreColumn = useCallback((stageId: string) => {
    setLoadingMoreStageId(stageId);
    setBoardExtraByStage((prev) => ({
      ...prev,
      [stageId]: (prev[stageId] ?? 0) + BOARD_PAGE_SIZE,
    }));
  }, []);

  // Presença "quem está vendo" (estilo Kommo) — chaveada pelo CUID real do
  // deal (não pelo ?deal=<número>), pra ambas as janelas baterem na mesma sala.
  const dealViewers = useEntityViewers("deal", dealDetail?.id ?? null);

  // Quando dealDetail carrega via lookup por número sequencial (?deal=102),
  // troca activeDealId para o CUID real (mutations usam CUID).
  useEffect(() => {
    if (
      dealDetail?.id &&
      activeDealId &&
      /^\d+$/.test(activeDealId) &&
      dealDetail.id !== activeDealId
    ) {
      setActiveDealId(dealDetail.id);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealDetail?.id]);

  // URL só com número: após detail (ou legado com CUID), replaceState.
  useEffect(() => {
    const num = (dealDetail as { number?: number } | undefined)?.number;
    if (num == null || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const urlVal = String(num);
    if (url.searchParams.get("deal") === urlVal) return;
    url.searchParams.set("deal", urlVal);
    window.history.replaceState(window.history.state, "", url.toString());
  }, [dealDetail]);

  // Etapa do deal aberto: primeiro o card no board (se já carregou na
  // página da coluna); senão o GET /deals/:id. Deep-link `?deal=54113`
  // com sort/página corta o card fora do board — sem este fallback o
  // dropdown de etapa some e o estágio fica estático.
  const detailStage = (
    dealDetail as { stage?: { id?: string; name?: string; pipeline?: { id?: string } } } | undefined
  )?.stage;
  const activeDealStage = useMemo(() => {
    if (!activeDealId) return undefined;
    const realId = dealDetail?.id ?? activeDealId;
    const onBoard = board.find((s) =>
      s.deals.some((d) => d.id === realId || d.id === activeDealId),
    );
    if (onBoard) return onBoard;
    if (detailStage?.id) return board.find((s) => s.id === detailStage.id);
    return undefined;
  }, [activeDealId, board, dealDetail?.id, detailStage?.id]);
  const activeDealStageName = activeDealStage?.name ?? detailStage?.name;
  const activeDealStageId = activeDealStage?.id ?? detailStage?.id ?? null;
  const stagePickerDealId = dealDetail?.id ?? (activeDealId && !/^\d+$/.test(activeDealId) ? activeDealId : null);

  // Deep-link pode abrir um deal de outro funil (`?pipeline=1` vs funil real).
  useEffect(() => {
    const pipeId = detailStage?.pipeline?.id;
    if (!pipeId || !pipelineId || pipeId === pipelineId) return;
    setPipelineId(pipeId);
  }, [detailStage?.pipeline?.id, pipelineId, setPipelineId]);

  // Seed otimista a partir do card do board — o painel abre no layout final
  // com nome/telefone/etapa já preenchidos, sem esperar GET /deals/:id.
  const boardDealSeed = useMemo(() => {
    if (!activeDealId) return null;
    return dealById.get(activeDealId) ?? null;
  }, [activeDealId, dealById]);

  // Campos personalizados: mesma fonte do contact-aside (inboxLeadPanelFields + dealInboxPanelFields).
  // Prefer contactId do detail; no loading usa o do card do board.
  const dealContactId =
    dealDetail?.contact?.id ?? boardDealSeed?.contact?.id ?? null;
  const { data: dealContact } = useContactSidebar(dealContactId);

  const dealDetailVm: DealDetail | null = useMemo(() => {
    if (dealDetail) {
      // Contato = pessoa; título do deal ("Negócio …") nunca vira nome de contato.
      const contactName =
        sanitizeContactName(dealDetail.contact?.name) ||
        personNameFromDealTitle(dealDetail.title) ||
        "Sem nome";
      const ownerName = dealDetail.owner?.name?.trim() || "Sem responsavel";
      return {
        id: dealDetail.id,
        number: (dealDetail as { number?: number }).number ?? null,
        contactId: dealDetail.contact?.id ?? null,
        contactNumber: (dealDetail.contact as { number?: number } | null)?.number ?? null,
        name: contactName,
        initials: avatarInitials(contactName),
        avatarColor: avatarColorSlugFromName(contactName),
        phone: dealDetail.contact?.phone ?? undefined,
        email: dealDetail.contact?.email ?? null,
        whatsappUsername:
          (dealDetail.contact as { whatsappUsername?: string | null } | null)?.whatsappUsername ?? null,
        contactSource:
          (dealDetail.contact as { source?: string | null } | null)?.source ?? null,
        value: dealDetail.value ?? null,
        online: undefined,
        stage: activeDealStageName,
        pipelineName:
          (dealDetail as { stage?: { pipeline?: { name?: string } } }).stage?.pipeline?.name ?? null,
        owner: {
          initials: avatarInitials(ownerName),
          name: ownerName,
          avatarColor: avatarColorSlugFromName(ownerName),
        },
        status: (dealDetail as { status?: "OPEN" | "WON" | "LOST" }).status ?? null,
        lostReason:
          (dealDetail as { lostReason?: string | null }).lostReason ?? null,
      };
    }

    // Enquanto a API não responde: monta VM parcial do card do kanban.
    if (!boardDealSeed) return null;
    const contactName =
      sanitizeContactName(boardDealSeed.contact?.name) ||
      personNameFromDealTitle(boardDealSeed.title) ||
      "Sem nome";
    const ownerName = boardDealSeed.owner?.name?.trim() || "Sem responsavel";
    return {
      id: boardDealSeed.id,
      number: boardDealSeed.number ?? null,
      contactId: boardDealSeed.contact?.id ?? null,
      contactNumber: boardDealSeed.contact?.number ?? null,
      name: contactName,
      initials: avatarInitials(contactName),
      avatarColor: avatarColorSlugFromName(contactName),
      phone: boardDealSeed.contact?.phone ?? undefined,
      email: boardDealSeed.contact?.email ?? null,
      whatsappUsername: null,
      contactSource: null,
      value: boardDealSeed.value ?? null,
      online: undefined,
      stage: activeDealStageName,
      pipelineName: pipelines?.find((p) => p.id === pipelineId)?.name ?? null,
      owner: {
        initials: avatarInitials(ownerName),
        name: ownerName,
        avatarColor: avatarColorSlugFromName(ownerName),
      },
      status: (boardDealSeed.status as "OPEN" | "WON" | "LOST" | undefined) ?? null,
      lostReason: boardDealSeed.lostReason ?? null,
    };
  }, [dealDetail, boardDealSeed, activeDealStageName, pipelines, pipelineId]);

  // Negócio SEM contato vinculado: cria um contato com o telefone/email
  // digitado e vincula ao deal (o painel chama isso via customSave do
  // editor inline). Lança o erro de volta pro editor não fechar em falha.
  const handleCreateContactForField = useCallback(
    async (field: "phone" | "email", value: string) => {
      if (!activeDealId) return;
      const v = value.trim();
      if (!v) return;
      try {
        // Nunca gravar "Negócio …" como nome do contato — só o nome da pessoa.
        const name =
          personNameFromDealTitle(dealDetail?.title) ||
          (field === "email" ? "Novo contato" : v);
        const contact = await createContact({
          name,
          ...(field === "phone" ? { phone: v } : { email: v }),
        });
        await updateDeal(activeDealId, { contactId: contact.id });
        queryClient.invalidateQueries({ queryKey: dealDetailKey(activeDealId) });
        queryClient.invalidateQueries({ queryKey: ["pipeline-board"], exact: false });
        queryClient.invalidateQueries({ queryKey: ["contact-sidebar", contact.id] });
        toast.success("Contato criado e vinculado ao negócio.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao criar contato.");
        throw e;
      }
    },
    [activeDealId, dealDetail?.title, queryClient],
  );

  // ── Conversa real ligada ao deal ────────────────────────────────
  // Escolhe o ticket ATIVO do contato; so cai na primeira da lista (a mais
  // recente por updatedAt, ja ordenada pelo backend em getDealById) quando
  // todos estao encerrados. A preferencia explicita e necessaria porque
  // `updatedAt` nao mede atividade de mensagem: o `updateMany` que propaga o
  // dono do negocio carimba o mesmo timestamp em todos os tickets, entao a
  // ordem sozinha ja abriu ticket encerrado enquanto o cliente respondia no
  // aberto. O banco garante no maximo um nao-RESOLVED por (org, contato,
  // canal) — indice unico parcial `conversations_active_contact_channel`.
  // Quando o deal nao tem contato vinculado ou nao ha conversa, o binding
  // retorna nodes de "vazio".
  const dealConversations =
    (dealDetail?.contact as
      | {
          conversations?: {
            id: string;
            status?: string | null;
            closedAt?: string | null;
            number?: number | null;
            departmentId?: string | null;
            department?: {
              id: string;
              name?: string | null;
              requireTabulationOnClose?: boolean;
            } | null;
          }[];
        }
      | null
      | undefined
    )?.conversations ?? [];
  const dealConversation =
    dealConversations.find((c) => c.status !== "RESOLVED") ??
    dealConversations[0] ??
    null;
  const dealConversationId = dealConversation?.id ?? null;
  const dealConversationDepartmentId =
    dealConversation?.departmentId ??
    dealConversation?.department?.id ??
    null;
  const dealConversationRequiresTabulation =
    !!dealConversation?.department?.requireTabulationOnClose;
  const dealContactName =
    sanitizeContactName(dealDetail?.contact?.name) ||
    personNameFromDealTitle(dealDetail?.title) ||
    "Contato";
  const dealChatBindingParams = {
    conversationId: dealConversationId,
    contactName: dealContactName,
    contactId: dealContactId,
    dealId: activeDealId,
    isResolved: dealConversation?.status === "RESOLVED",
    closedAt: dealConversation?.closedAt ?? null,
    conversationNumber: dealConversation?.number ?? null,
    departmentId: dealConversationDepartmentId,
    requireTabulationOnClose: dealConversationRequiresTabulation,
  };

  const boardQuery = hasServerBoard ? boardFiltered : boardNormal;
  const pipelinesEmpty = Array.isArray(pipelines) && pipelines.length === 0;
  // Sem pipelineId a query do board fica disabled. Não esconder o chrome —
  // header fica visível; o loader fica só no body. Timeout/erro soltam o
  // spinner (query idle/`refetchOnMount: false` não tem isError).
  const pipelinesPending =
    sessionStatus === "loading" ||
    (isAuthenticated && !boardLookupId && !pipelinesEmpty && !pipelinesQuery.isError);
  const pipelinesStuck = useStuckTimeout(pipelinesPending);
  const waitingForPipeline = pipelinesPending && !pipelinesStuck;

  const boardPending =
    !!boardLookupId && columns.length === 0 && !boardQuery.isError && !boardQuery.data;
  const boardStuck = useStuckTimeout(boardPending);
  const waitingForBoard = boardPending && !boardStuck;

  const boardIdleUnfetched =
    !boardQuery.data &&
    boardQuery.fetchStatus === "idle" &&
    !boardQuery.isFetched &&
    !boardQuery.isError;

  useLayoutEffect(() => {
    if (!boardLookupId || !isAuthenticated) return;
    if (boardIdleUnfetched) void boardQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardLookupId, isAuthenticated, boardIdleUnfetched]);

  function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }
    requestMove({
      dealId: draggableId,
      fromStageId: source.droppableId,
      toStageId: destination.droppableId,
      toIndex: destination.index,
    });
  }

  return (
    <div className="v2-screen grid grid-cols-[var(--nav-rail-w,72px)_1fr] gap-4 p-4" style={{ gridTemplateRows: "1fr" }}>
      {navRail ?? <NavRailSpacer />}
      <div
        ref={boardWrapperRef}
        className="flex h-full min-h-0 min-w-0 flex-col gap-3 overflow-clip"
      >
        <PipelineHeader
          tabsOverride={<></>}
          activeView="kanban"
          onViewChange={(view) => {
            writePipelineViewPreference(view);
            if (view === "kanban") return;
            router.push(
              view === "list" && listHref
                ? listHref
                : pathForPipelineView(view),
            );
          }}
          titleAccessory={
            <PipelineSwitcher
              variant="icon"
              selectedId={pipelineId}
              onChange={(id) => setPipelineId(id)}
            />
          }
          searchSlot={
            <PipelineSearchFilterBar
              search={search}
              onSearch={setSearch}
              filters={filters}
              onApplyFilters={setFilters}
              onClearFilters={clearFilters}
              options={filterOptions}
              optionsLoading={filterOptionsLoading}
              sortKey={sortKey}
              onSortKeyChange={(k) => setSortKey(k)}
              pipelineId={pipelineId}
              onFilterPanelOpenChange={setFilterPanelOpen}
              onPickDeal={(deal) => {
                const dest = deal.stage?.pipelineId;
                if (dest && dest !== pipelineId) setPipelineId(dest);
                setActiveDeal(deal.id, deal.number);
              }}
            />
          }
          period={<PipelinePeriodCalendar filters={filters} onPatch={patchFilters} />}
          menuSlot={
            <div className="flex items-center gap-2">
              <PageTourButton tourId="pipeline" />
              <TooltipGlass label="Ordenar, importar e exportar" side="bottom">
                <button
                  ref={kebabBtnRef}
                  type="button"
                  data-pipeline-kebab-trigger=""
                  data-tour="pipeline-actions"
                  onClick={() => setKebabOpen((v) => !v)}
                  aria-label="Ações do pipeline"
                  aria-expanded={kebabOpen}
                  className={cn(
                    pageActionsMenuTriggerClass,
                    kebabOpen && "ring-2 ring-primary/35 brightness-95",
                  )}
                >
                  <IconMenu2 size={18} stroke={2.2} />
                </button>
              </TooltipGlass>
            </div>
          }
        />
        {/* Portal do menu ancorado no botão do header — irmão, não filho do slot. */}
        <PipelineKebabMenu
          open={kebabOpen}
          anchorRef={kebabBtnRef}
          onNewDeal={
            columns.length > 0
              ? () => {
                  setAddStage({ id: columns[0].stageId, name: columns[0].title });
                  setKebabOpen(false);
                }
              : undefined
          }
          onImport={() => { setImportExportOpen("import"); setKebabOpen(false); }}
          onExport={() => { setImportExportOpen("export"); setKebabOpen(false); }}
          onChannels={() => { setChannelsModalOpen(true); setKebabOpen(false); }}
          onSettings={() => { router.push("/settings/pipeline"); setKebabOpen(false); }}
          selectionMode={selectionMode}
          onToggleSelectionMode={() => {
            setSelectionMode((v) => {
              const next = !v;
              if (!next) {
                setSelectedIds(new Set());
                setFullySelectedStageIds(new Set());
              }
              return next;
            });
            setKebabOpen(false);
          }}
          onClose={() => setKebabOpen(false)}
        />

        {!activeDealId && (waitingForPipeline || waitingForBoard) ? (
          <AppLoading variant="inline" className="min-h-0 flex-1" />
        ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={boardRef}
            data-tour="pipeline-kanban"
            className="kanban-board-hscroll flex min-h-0 min-w-0 flex-1 gap-3.5 overflow-x-auto overflow-y-hidden"
          >
            {columns.map((col) => {
              const rawStage = boardNormal.data?.find((s) => s.id === col.stageId);
              const remaining = Math.max(
                0,
                (rawStage?.totalCount ?? 0) - (rawStage?.deals.length ?? 0),
              );
              return (
              <DroppableColumn
                key={col.stageId}
                column={col}
                onDealClick={(id) => {
                  const raw = dealById.get(id);
                  setActiveDeal(id, raw?.number ?? null);
                }}
                dealById={dealById}
                pipelineId={pipelineId}
                statusFilter={status}
                stages={board}
                selectedIds={selectedIds}
                selectionMode={selectionMode}
                fullySelected={fullySelectedStageIds.has(col.stageId)}
                selectingAll={selectingStageId === col.stageId}
                onToggleSelect={toggleSelect}
                onToggleSelectAllInColumn={() => void toggleSelectAllInStage(col.stageId)}
                onRequestMove={requestMove}
                onAddDeal={() =>
                  setAddStage({ id: col.stageId, name: col.title })
                }
                canChangeStage={canChangeStage}
                loadMore={
                  !hasServerBoard && rawStage?.hasMore && remaining > 0
                    ? {
                        remaining,
                        loading: loadingMoreStageId === col.stageId,
                        onClick: () => handleLoadMoreColumn(col.stageId),
                      }
                    : undefined
                }
              />
              );
            })}
            {columns.length === 0 ? (
              <EmptyBoard isAuthenticated={isAuthenticated} />
            ) : null}
          </div>
          {/* ScrollMap horizontal: só desktop — no mobile a barra inferior atrapalha. */}
          <ScrollMap
            boardRef={boardRef}
            columnCount={columns.length}
            className="max-md:hidden"
          />
          <ScrollMapVertical boardRef={boardRef} columnCount={columns.length} />
          </div>{/* fim relative wrapper */}
        </DragDropContext>
        )}
      </div>

      {importExportOpen && (
        <ImportExportModal
          activeTab={importExportOpen}
          onClose={() => setImportExportOpen(null)}
          bump={bump}
          exportScope={{
            pipelineId,
            filters: mergedFilters,
            status,
            filteredTotal,
            pipelineTotal: pipelineTotalUnfiltered,
          }}
        />
      )}

      {channelsModalOpen && pipelineId && (
        <PipelineChannelsModal
          pipelineId={pipelineId}
          pipelineName={pipelines?.find((p) => p.id === pipelineId)?.name}
          open={channelsModalOpen}
          onClose={() => setChannelsModalOpen(false)}
        />
      )}

      <DealChatBindingHost {...dealChatBindingParams}>
        {({
          messagesNode,
          composerNode,
          sessionAlertNode,
          templateModal,
          pinnedNote,
          pinnedMessageSlot,
          connection: dealConnection,
        }) => (
          <>
      <DealDetailPanel
        isOpen={!!activeDealId}
        onClose={() => setActiveDeal(null)}
        deal={dealDetailVm ?? undefined}
        viewersSlot={<DealViewersStack viewers={dealViewers} variant="banner" />}
        stageRibbonSlot={
          stagePickerDealId && activeDealStageId ? (
            <div className="flex items-center gap-1">
              {board.map((s, idx) => {
                const currentIdx = board.findIndex(
                  (b) => b.id === activeDealStageId,
                );
                const done = idx < currentIdx;
                const active = s.id === activeDealStageId;
                return (
                  <span
                    key={s.id}
                    className="flex-1 truncate rounded-full border px-2 py-1.5 font-display text-[10px] font-bold uppercase tracking-[0.06em]"
                    style={
                      active
                        ? {
                            background: "var(--brand-primary)",
                            color: "#fff",
                            borderColor: "var(--brand-primary-dark)",
                            boxShadow: "0 4px 12px rgba(91,111,245,0.35)",
                          }
                        : done
                          ? {
                              background: "var(--color-success-bg)",
                              color: "var(--color-success-text)",
                              borderColor: "rgba(16,185,129,0.25)",
                            }
                          : {
                              background: "var(--glass-bg)",
                              color: "var(--text-muted)",
                              borderColor: "var(--glass-border)",
                            }
                    }
                  >
                    {s.name}
                  </span>
                );
              })}
            </div>
          ) : undefined
        }
        stageDropdownSlot={
          stagePickerDealId && activeDealStageId ? (
            <StagePicker
              dealId={stagePickerDealId}
              currentStageId={activeDealStageId}
              pipelineId={pipelineId}
              statusFilter={status}
              onRequestMove={requestMove}
            >
              {({ onSelectStage, isPending, canMove }) => (
                <StageDropdown
                  stages={board}
                  currentStageId={activeDealStageId}
                  currentPipelineId={pipelineId}
                  isPending={isPending}
                  canMove={canMove}
                  onSelect={onSelectStage}
                />
              )}
            </StagePicker>
          ) : undefined
        }
        funnelSegments={board.map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color ?? "var(--brand-primary)",
          position: s.position,
        }))}
        winButtonSlot={
          activeDealId ? (
            <WinButton
              dealId={activeDealId}
              currentStatus={dealDetail?.status ?? "OPEN"}
              pipelineId={pipelineId}
              statusFilter={status}
              trigger={
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-display text-xs font-semibold text-white transition-transform hover:-translate-y-0.5"
                  style={{
                    background:
                      dealDetail?.status === "WON"
                        ? "var(--text-muted)"
                        : "var(--color-success)",
                    boxShadow: "0 4px 14px rgba(16,185,129,0.30)",
                  }}
                >
                  <IconTrophy size={14} />
                  {dealDetail?.status === "WON" ? "Reabrir" : "Ganhar"}
                </span>
              }
            />
          ) : undefined
        }
        contactEditSlot={
          activeDealId && dealContactId ? (
            <ContactEditDialog
              contactId={dealContactId}
              initial={{
                name: dealDetail?.contact?.name ?? "",
                email: dealDetail?.contact?.email ?? null,
                phone: dealDetail?.contact?.phone ?? null,
              }}
              onSaved={() => {
                queryClient.invalidateQueries({ queryKey: dealDetailKey(activeDealId) });
                queryClient.invalidateQueries({ queryKey: ["pipeline-board"], exact: false });
              }}
            />
          ) : undefined
        }
        deleteSlot={undefined}
        callButtonSlot={
          activeDealId && dealDetailVm ? (
            <DealCallButton
              dealId={activeDealId}
              phone={dealDetailVm.phone ?? null}
              contactId={dealDetailVm.contactId ?? undefined}
            />
          ) : null
        }
        moreActionsSlot={
          activeDealId ? (
            <DealActionsMenu
              dealId={activeDealId}
              currentStatus={dealDetail?.status ?? "OPEN"}
              pipelineId={pipelineId}
              statusFilter={status}
              onDeleted={() => setActiveDeal(null)}
              trigger={
                <TooltipGlass label="Mais opções" side="left">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/80 transition-all hover:bg-white/20 hover:text-white hover:border-white/35"
                  >
                    <IconDotsVertical size={14} />
                  </span>
                </TooltipGlass>
              }
            />
          ) : undefined
        }
        ownerSlot={
          activeDealId ? (
            <AssigneePopover
              dealId={activeDealId}
              currentOwnerId={dealDetail?.owner?.id ?? null}
              currentOwnerName={dealDetail?.owner?.name ?? null}
              pipelineId={pipelineId}
              statusFilter={status}
              trigger={
                dealDetail?.owner?.name ? (
                  // Responsável (agente) no header do aside: mesmo padrão do
                  // card do kanban — UserAvatar (gradiente/foto/iniciais) + nome.
                  <span
                    className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] py-px pl-px pr-2 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--glass-bg-base)]"
                    title={dealDetail.owner.name}
                  >
                    <UserAvatar
                      name={dealDetail.owner.name}
                      imageUrl={dealDetail.owner.avatarUrl ?? null}
                      size={22}
                    />
                    <span className="min-w-0 truncate font-display text-[11px] font-semibold text-[var(--text-secondary)]">
                      {dealDetail.owner.name}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex cursor-pointer items-center rounded-full px-2.5 py-1 font-display text-[11px] font-semibold transition-opacity hover:opacity-75">
                    + Responsável
                  </span>
                )
              }
            />
          ) : undefined
        }
        // sourceSlot removido (DD5): antes tentava persistir Deal.source,
        // mas esse campo nao existe no schema (backend silenciosamente
        // ignorava o PUT). A row "Origem" foi movida pro cabecalho fixo
        // do DealDetailPanel usando Contact.source nativo via
        // InlineNativeEditor.
        customFieldsSlot={(() => {
          // Contact fields: filtrados por showInInboxLeadPanel (inalterado).
          // Deal fields: agora usa dealPanelFields do deal detail (filtrados por
          // showInDealPanel) para separar as configurações de visibilidade do inbox.
          const contactFields = dealContact?.inboxLeadPanelFields ?? [];
          const dealPanelFields = (dealDetail as { dealPanelFields?: import("@/features/pipeline-v2/api/deals").DealPanelField[] } | null)?.dealPanelFields ?? [];
          const seen = new Set<string>();
          type CFEntry = { fieldId: string; label?: string; name?: string; value: string | null; type: string; options?: string[]; highlightRules?: unknown[] | null; highlight?: { severity: string; label: string } | null; _et: "contact" | "deal"; _eid: string };
          const tagged: CFEntry[] = [
            ...contactFields.map((f) => ({ ...f, _et: "contact" as const, _eid: dealContactId ?? "" })),
            ...dealPanelFields.map((f) => ({ ...f, _et: "deal" as const, _eid: activeDealId ?? "" })),
          ];
          return tagged
            .filter((f) => {
              if (seen.has(f.fieldId)) return false;
              seen.add(f.fieldId);
              return true;
            })
            .map((f) => ({
              fieldId: f.fieldId,
              label: f.label || f.name || f.fieldId,
              value: f.value,
              type: f.type,
              options: f.options ?? [],
              entityType: f._et,
              entityId: f._eid,
              highlightRules: f.highlightRules ?? null,
              highlight: f.highlight ?? null,
            }));
        })()}
        messagesSlot={messagesNode}
        composerSlot={composerNode}
        sessionAlertSlot={sessionAlertNode ?? null}
        pinnedMessageSlot={pinnedMessageSlot}
        connection={dealConnection}
        conversationId={dealConversationId}
        isResolved={
          (dealDetail?.contact as { conversations?: { status?: string }[] } | null | undefined)
            ?.conversations?.[0]?.status === "RESOLVED"
        }
        conversationNumber={
          (dealDetail?.contact as { conversations?: { number?: number | null }[] } | null | undefined)
            ?.conversations?.[0]?.number ?? null
        }
        conversationClosedAt={
          (dealDetail?.contact as { conversations?: { closedAt?: string | null }[] } | null | undefined)
            ?.conversations?.[0]?.closedAt ?? null
        }
        conversationDepartmentId={dealConversationDepartmentId}
        conversationRequiresTabulation={dealConversationRequiresTabulation}
        tabContentOverride={
          activeDealId
            ? {
                notas: (
                  <DealNotesTab
                    dealId={activeDealId}
                    notes={dealDetail?.notes ?? null}
                    pipelineId={pipelineId}
                    statusFilter={status}
                    pinnedNote={pinnedNote}
                  />
                ),
                timeline: <DealTimelineTab dealId={activeDealId} />,
                atividades: (
                  <div className="flex-1 overflow-auto">
                    <ActivitiesPanel
                      dealId={activeDealId}
                      contactId={dealContactId}
                      contactName={dealDetail?.contact?.name ?? null}
                      dealTitle={dealDetail?.title ?? null}
                    />
                  </div>
                ),
                chamadas: (
                  <div className="flex-1 overflow-auto p-4">
                    <CallHistoryList
                      embedded
                      contactId={dealContactId ?? undefined}
                    />
                  </div>
                ),
              }
            : undefined
        }
        productsSlot={
          activeDealId ? (
            <div className="flex flex-col gap-3">
              <DealProductsSection dealId={activeDealId} compact />
              <DealQuotasSection dealId={activeDealId} />
            </div>
          ) : null
        }
        onCreateContactForField={handleCreateContactForField}
        tagsSlot={
          activeDealId ? (() => {
            const allTags = dealDetail?.tags ?? [];
            // Sem chip "+N": as demais tags aparecem em "Selecionadas",
            // dentro do popover de gerenciar tags.
            const MAX_VISIBLE = 2;
            const visibleTags = allTags.slice(0, MAX_VISIBLE);
            return (
              // "+" ancorado no canto direito (ml-auto): as chips ficam com
              // toda a largura restante da linha antes de truncar.
              <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
                {visibleTags.map((t) => (
                  <TooltipGlass key={t.id} label={t.name} side="top">
                    <TagChip
                      name={t.name}
                      color={t.color}
                      className="max-w-[9.5rem] min-w-0 shrink"
                    />
                  </TooltipGlass>
                ))}
                <span className="ml-auto shrink-0 pl-1">
                  <TagsPopover
                    dealId={activeDealId}
                    currentTags={allTags}
                    pipelineId={pipelineId}
                    statusFilter={status}
                    trigger={
                      <span className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-white/35 px-2.5 py-0.5 font-display text-[11px] font-semibold text-white/70 transition-colors hover:border-white hover:text-white">
                        <IconPlus size={10} />
                        {allTags.length === 0 ? "Adicionar" : ""}
                      </span>
                    }
                  />
                </span>
              </div>
            );
          })() : undefined
        }
        contactFieldConfigSlot={
          <RequirePermission permission="settings:custom_fields">
            <FieldConfigPanel entities={["contact"]} context="deal_panel_v2" />
          </RequirePermission>
        }
        dealFieldConfigSlot={
          <RequirePermission permission="settings:custom_fields">
            <FieldConfigPanel entities={["deal"]} context="deal_panel_v2" />
          </RequirePermission>
        }
        contactTagsSlot={
          // DD9: tags do contato (Contact.tags) ao lado de Telefone/Email
          // no FieldCard "Dados de Contato". Separado de tagsSlot (Deal.tags
          // — fica no header da sidebar). dealDetail.contact.tags ja vem
          // serializado no detailInclude do backend.
          dealDetailVm?.contactId ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {(dealDetail?.contact?.tags ?? []).map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-display text-[10.5px] font-semibold"
                  style={{
                    background: `${t.color ?? "#5b6ff5"}22`,
                    color: t.color ?? "var(--brand-primary)",
                    border: `1px solid ${t.color ?? "#5b6ff5"}44`,
                  }}
                >
                  {t.name}
                </span>
              ))}
              <ContactTagsPopover
                contactId={dealDetailVm.contactId}
                currentTags={dealDetail?.contact?.tags ?? []}
                triggerVariant="icon"
              />
            </div>
          ) : null
        }
      />
            {templateModal}
          </>
        )}
      </DealChatBindingHost>

      <AddDealDialog
        open={!!addStage}
        onOpenChange={(o) => {
          if (!o) setAddStage(null);
        }}
        stages={board.map((s) => ({ id: s.id, name: s.name }))}
        defaultStageId={addStage?.id ?? null}
        pipelineId={pipelineId}
        statusFilter={status}
      />

      {/* Tabulação do motivo da perda — abre sempre que um deal vai
          para o estágio Perdido (drag, menu do card ou drawer). */}
      <LossReasonDialog
        open={!!pendingLostMove && !!lossMetaQuery.data?.lossReasonRequired}
        onOpenChange={(o) => {
          if (!o) setPendingLostMove(null);
        }}
        pipelineId={pipelineId}
        // NÃO usar `moveDeal.isPending` aqui: é a mesma mutation usada na
        // reabertura do lead, então um move anterior ainda em voo deixava o
        // "Confirmar perda" desabilitado mesmo com o motivo já selecionado.
        // O diálogo fecha no onConfirm, então não há risco de duplo submit.
        title="Mover para Perdido"
        description="Informe o motivo da perda para concluir a movimentação."
        onConfirm={(reason) => {
          if (!pendingLostMove) return;
          moveDeal.mutate({ ...pendingLostMove, lostReason: reason });
          setPendingLostMove(null);
        }}
      />

      {pipelineId ? (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          selectedIds={selectedIds}
          onClear={clearSelection}
          pipelineId={pipelineId}
          stages={board.map((s) => ({
            id: s.id,
            name: s.name,
            color: s.color ?? undefined,
            isLost: s.isLost,
          }))}
          users={teamUsers.map((u) => ({ id: u.id, name: u.name }))}
          scopeContext={scopeContext}
        />
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// StageDropdown — dropdown glass para troca de fase na sidebar.
// Reusa o estilo de PipelineSwitcher / AssigneePopover.
// ─────────────────────────────────────────────────────────────────

function StageDropdown({
  stages,
  currentStageId,
  currentPipelineId,
  isPending,
  canMove = true,
  onSelect,
}: {
  stages: BoardStageDto[];
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
      const menu = document.getElementById("pipeline-stage-dropdown-menu");
      if (menu?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Portal + fixed: evita clip por overflow-hidden do painel; ancora a
  // direita do trigger quando o menu vazaria da viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const b = triggerRef.current.getBoundingClientRect();
    const longest = stages.reduce((n, s) => Math.max(n, s.name.length), 0);
    // Largura suficiente para nomes longos (+ espaco p/ badge "Atual")
    const menuWidth = Math.min(
      Math.max(240, longest * 9 + 72),
      Math.min(340, window.innerWidth - 16),
    );
    const wouldOverflow = b.left + menuWidth > window.innerWidth - 8;
    const left = wouldOverflow ? Math.max(8, b.right - menuWidth) : b.left;
    setPos({ top: b.bottom + 6, left, width: menuWidth });
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
          "flex max-w-[min(100%,14rem)] items-center gap-1.5 font-display text-[15px] font-bold text-[var(--text-primary)] transition-opacity hover:opacity-70 disabled:opacity-50",
          isPending && "cursor-wait",
          !canMove && "cursor-default hover:opacity-100",
        )}
      >
        <span
          className="inline-block h-2 w-2 shrink-0 rounded-full"
          style={{ background: current?.color ?? "var(--brand-primary)" }}
        />
        <span className="truncate">{current?.name ?? "Selecionar fase"}</span>
        <IconChevronDown
          size={14}
          className={cn(
            "shrink-0 text-[var(--text-muted)] transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open &&
        pos &&
        typeof document !== "undefined" &&
        createPortal(
          // Opaco real (bg-white / dark solid) — mesmo criterio do inbox:
          // evita translucidez sobre o kanban (DD2 - jun/26).
          <div
            id="pipeline-stage-dropdown-menu"
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="z-(--z-popover) overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white py-1 shadow-[0_8px_24px_rgba(15,20,40,0.14)] v2-dark:bg-[#1a1f2e] v2-dark:shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
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
        )}
    </div>
  );
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("pt-BR");
  } catch {
    return iso;
  }
}

// ────────────────���────────────────────────────────────────────────
// Coluna drop-friendly: re-renderiza a KanbanColumn original com
// uma área Droppable em cima dos cards.
// ─────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────
// CardMoveMenu — botão "Mover" no rodapé do card que abre um menu de
// fases (alternativa ao drag-and-drop, útil no mobile/touch). Reusa o
// StagePicker (useMoveDeal) para a mutação com update otimista.
// ─────────────────────────────────────────────────────────────────
function CardMoveMenu({
  dealId,
  currentStageId,
  pipelineId,
  statusFilter,
  stages,
  onRequestMove,
}: {
  dealId: string;
  currentStageId: string;
  pipelineId: string | null;
  statusFilter: StatusFilter;
  stages: BoardStageDto[];
  onRequestMove?: (vars: {
    dealId: string;
    fromStageId: string;
    toStageId: string;
    toPipelineId?: string | null;
  }) => void;
}) {
  return (
    <StagePicker
      dealId={dealId}
      currentStageId={currentStageId}
      pipelineId={pipelineId}
      statusFilter={statusFilter}
      onRequestMove={onRequestMove}
    >
      {({ onSelectStage, isPending }) => (
        <CardMoveDropdown
          stages={stages}
          currentStageId={currentStageId}
          currentPipelineId={pipelineId}
          isPending={isPending}
          onSelect={onSelectStage}
        />
      )}
    </StagePicker>
  );
}

function CardMoveDropdown({
  stages,
  currentStageId,
  currentPipelineId,
  isPending,
  onSelect,
}: {
  stages: BoardStageDto[];
  currentStageId: string;
  currentPipelineId: string | null;
  isPending: boolean;
  onSelect: (stageId: string, toPipelineId?: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora — verifica tanto o botão quanto o menu no portal
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        !btnRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function handleOpen() {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    // Posiciona acima do botão, alinhado à direita
    setCoords({ top: rect.top + window.scrollY, left: rect.right + window.scrollX });
    setOpen((v) => !v);
  }

  const menu = open && coords && typeof document !== "undefined"
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            position: "absolute",
            top: coords.top,
            left: coords.left,
            zIndex: "var(--z-popover)",
            transform: "translate(-100%, -100%)",
            marginBottom: "6px",
          }}
          className="max-h-[320px] min-w-[220px] overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)] py-1 shadow-[0_8px_24px_rgba(15,20,40,0.18)]"
        >
          <MoveToStageMenu
            stages={stages}
            currentStageId={currentStageId}
            currentPipelineId={currentPipelineId}
            isPending={isPending}
            header={
              <div className="px-3 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                Mover para
              </div>
            }
            onSelect={(stageId, toPipeId) => {
              onSelect(stageId, toPipeId);
              setOpen(false);
            }}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <TooltipGlass label="Mover de fase" side="top">
        <button
          ref={btnRef}
          type="button"
          disabled={isPending}
          aria-label="Mover de fase"
          onClick={handleOpen}
          // Espelha o botão de transferência de conversa (inbox): pílula
          // ciano sólida, para a ação não passar despercebida no rodapé.
          className="flex size-7 items-center justify-center rounded-full bg-cyan-500 text-white shadow-[0_2px_8px_rgba(6,182,212,0.35)] transition-all hover:bg-cyan-600 disabled:cursor-wait disabled:opacity-50"
        >
          <IconArrowsExchange size={15} stroke={2.2} />
        </button>
      </TooltipGlass>
      {menu}
    </>
  );
}

function DroppableColumn({
  column,
  onDealClick,
  dealById,
  pipelineId,
  statusFilter,
  onAddDeal,
  stages,
  selectedIds,
  selectionMode,
  fullySelected,
  selectingAll,
  onToggleSelect,
  onToggleSelectAllInColumn,
  onRequestMove,
  canChangeStage,
  loadMore,
}: {
  column: KanbanColumnView;
  onDealClick: (id: string) => void;
  dealById: Map<string, BoardDealDto>;
  pipelineId: string | null;
  statusFilter: StatusFilter;
  onAddDeal?: () => void;
  stages: BoardStageDto[];
  selectedIds: Set<string>;
  selectionMode: boolean;
  fullySelected: boolean;
  selectingAll: boolean;
  onToggleSelect: (id: string) => void;
  onToggleSelectAllInColumn: () => void;
  onRequestMove?: (vars: {
    dealId: string;
    fromStageId: string;
    toStageId: string;
    toPipelineId?: string | null;
  }) => void;
  canChangeStage: boolean;
  loadMore?: { remaining: number; loading: boolean; onClick: () => void };
}) {
  const dealIdsInColumn = column.deals.map((d) => d.id);
  const selectedInColumnCount = dealIdsInColumn.reduce(
    (acc, id) => acc + (selectedIds.has(id) ? 1 : 0),
    0,
  );
  const totalInColumn = column.count;
  const allSelected = fullySelected && totalInColumn > 0;
  const someSelected = allSelected || selectedInColumnCount > 0;
  const selectedCount = allSelected ? totalInColumn : selectedInColumnCount;

  return (
    <Droppable droppableId={column.stageId} isDropDisabled={!canChangeStage}>
      {(provided, snapshot) => (
        <KanbanColumn
          title={column.title}
          color={column.color}
          stageColor={column.stageColor}
          count={column.count}
          total={column.total}
          deals={column.deals}
          onDealClick={onDealClick}
          onAddDeal={onAddDeal}
          selection={{
            allSelected,
            someSelected,
            selectedCount,
            totalInColumn,
            onToggleAll: onToggleSelectAllInColumn,
            loading: selectingAll,
            enabled: selectionMode && canChangeStage,
          }}
          dealsContainerRef={provided.innerRef}
          loadMore={loadMore}
          dealsContainerProps={{
            ...provided.droppableProps,
            "aria-label": `Coluna ${column.title}`,
            style: snapshot.isDraggingOver
              ? {
                  background: "rgba(91,111,245,0.05)",
                  borderRadius: "var(--radius-lg)",
                }
              : undefined,
          }}
          placeholderSlot={provided.placeholder}
          renderDeal={(deal, index) => {
            const raw = dealById.get(deal.id);
            return (
              <Draggable
                key={deal.id}
                draggableId={deal.id}
                index={index}
                isDragDisabled={!canChangeStage}
              >
                {(dragProvided, dragSnapshot) => {
                  const node = (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    {...dragProvided.dragHandleProps}
                    style={{
                      ...dragProvided.draggableProps.style,
                      opacity: dragSnapshot.isDragging ? 0.9 : 1,
                      cursor: canChangeStage ? undefined : "default",
                    }}
                  >
                    <DealCard
                      deal={deal}
                      onClick={() => onDealClick(deal.id)}
                      isSelected={selectedIds.has(deal.id)}
                      selectionMode={selectionMode}
                      onToggleSelect={() => onToggleSelect(deal.id)}
                      tagsSlot={(() => {
                        const allTags = raw?.tags ?? ([] as NonNullable<BoardDealDto["tags"]>);
                        if (allTags.length === 0) return undefined;
                        // Excedente não vira mais chip "+N": a lista completa
                        // (e a remoção) vive na seção "Selecionadas" do
                        // popover "Gerenciar tags".
                        const MAX_VISIBLE = 2;
                        const visibleTags = allTags.slice(0, MAX_VISIBLE);
                        return (
                          <>
                            {visibleTags.map((t) => (
                              // Linha única: chips truncam (max-w + min-w-0)
                              // e o trigger fica shrink-0 na mesma linha.
                              <TooltipGlass key={t.id} label={t.name} side="top">
                                <TagChip
                                  name={t.name}
                                  color={t.color}
                                  className="max-w-[9.5rem] min-w-0 shrink"
                                />
                              </TooltipGlass>
                            ))}
                          </>
                        );
                      })()}
                      tagsAddSlot={
                        <TagsPopover
                          dealId={deal.id}
                          currentTags={raw?.tags ?? []}
                          pipelineId={pipelineId}
                          statusFilter={statusFilter}
                          trigger={
                            <DealCardTagsTrigger
                              hasTags={(raw?.tags?.length ?? 0) > 0}
                            />
                          }
                        />
                      }
                      ownerSlot={
                        <AssigneePopover
                          dealId={deal.id}
                          currentOwnerId={raw?.owner?.id ?? null}
                          currentOwnerName={raw?.owner?.name ?? null}
                          pipelineId={pipelineId}
                          statusFilter={statusFilter}
                          trigger={
                            raw?.owner?.name ? (
                              // Owner: UserAvatar (padrão do agente — gradiente
                              // do brand + foto do perfil; iniciais como fallback).
                              <span
                                className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] py-px pl-px pr-2 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--glass-bg-base)]"
                                title={raw.owner.name}
                              >
                                <UserAvatar
                                  name={raw.owner.name}
                                  imageUrl={raw.owner.avatarUrl ?? null}
                                  size={22}
                                />
                                <span className="min-w-0 truncate font-display text-[10.5px] font-semibold text-[var(--text-secondary)]">
                                  {raw.owner.name}
                                </span>
                              </span>
                            ) : (
                              <Chip
                                variant="ghost"
                                className="cursor-pointer whitespace-nowrap transition-colors hover:text-[var(--brand-primary)]"
                              >
                                +Responsável
                              </Chip>
                            )
                          }
                        />
                      }
                      moveMenuSlot={
                        <CardMoveMenu
                          dealId={deal.id}
                          currentStageId={column.stageId}
                          pipelineId={pipelineId}
                          statusFilter={statusFilter}
                          stages={stages}
                          onRequestMove={onRequestMove}
                        />
                      }
                    />
                  </div>
                  );
                  // Enquanto arrasta, renderizamos o card num portal pro
                  // <body>. Os ancestrais do Kanban usam backdrop-blur/
                  // transform (glass), que criam um containing block novo e
                  // quebram o `position: fixed` que a lib aplica ao item
                  // arrastado — sem o portal, o card "some"/salta pra fora da
                  // tela. Portar pro body (sem ancestral transformado) faz o
                  // ghost seguir o cursor normalmente.
                  return dragSnapshot.isDragging && typeof document !== "undefined"
                    ? createPortal(node, document.body)
                    : node;
                }}
              </Draggable>
            );
          }}
        />
      )}
    </Droppable>
  );
}

function EmptyBoard({ isAuthenticated }: { isAuthenticated: boolean }) {
  return (
    <div className="grid w-full place-items-center rounded-[var(--radius-xl)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg)] p-12 text-center backdrop-blur-md">
      <div>
        <h2 className="font-display text-base font-bold text-[var(--text-primary)]">
          {isAuthenticated ? "Selecione um pipeline" : "Carregando..."}
        </h2>
        <p className="mt-1 max-w-sm text-[12.5px] text-[var(--text-muted)]">
          Pipeline ativo nao retornou estagios. Verifique a configuracao no painel
          de administracao.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────������────��───────────
// Helper: nome → slug de cor do v0 (av-blue, av-orange, ...).
// O novo DealDetailPanel usa `av-${avatarColor}` direto no className,
// então precisamos retornar um dos slugs definidos em globals-v2.css.
// ──────────────────────────────────��─���────────────────────────────

const AVATAR_SLUGS = [
  "green",
  "blue",
  "orange",
  "purple",
  "pink",
  "coral",
  "teal",
  "mint",
  "gray",
] as const;

function avatarColorSlugFromName(name: string | null | undefined): string {
  const safe = (name ?? "").trim();
  if (!safe) return "gray";
  let sum = 0;
  for (let i = 0; i < safe.length; i += 1) sum += safe.charCodeAt(i);
  return AVATAR_SLUGS[sum % AVATAR_SLUGS.length];
}

// ─── PipelineKebabMenu ─────────────────────────────────────���──────

interface PipelineKebabMenuProps {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onNewDeal?: () => void;
  onImport: () => void;
  onExport: () => void;
  onChannels: () => void;
  onSettings: () => void;
  selectionMode: boolean;
  onToggleSelectionMode: () => void;
  onClose: () => void;
}

function PipelineKebabMenu({
  open,
  anchorRef,
  onNewDeal,
  onImport,
  onExport,
  onChannels,
  onSettings,
  selectionMode,
  onToggleSelectionMode,
  onClose,
}: PipelineKebabMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Âncora visível do kebab (`data-pipeline-kebab-trigger`) — um único botão
  // no PageHeader; o lookup por data-attr cobre re-renders e portal.
  const resolveAnchor = useCallback((): HTMLElement | null => {
    const nodes = document.querySelectorAll<HTMLElement>(
      "[data-pipeline-kebab-trigger]",
    );
    for (const el of Array.from(nodes)) {
      if (el.offsetParent !== null) return el;
    }
    return anchorRef.current;
  }, [anchorRef]);

  // useLayoutEffect: mede o anchor antes do paint para não piscar em (0,0).
  useLayoutEffect(() => {
    if (!open) {
      setRect(null);
      return;
    }
    function updateRect() {
      const el = resolveAnchor();
      if (el) setRect(el.getBoundingClientRect());
    }
    updateRect();
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);
    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [open, resolveAnchor]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!document.contains(t)) return;
      const anchor = resolveAnchor();
      if (
        menuRef.current &&
        !menuRef.current.contains(t) &&
        anchor &&
        !anchor.contains(t)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", fn, true);
    return () => document.removeEventListener("mousedown", fn, true);
  }, [open, onClose, resolveAnchor]);

  if (!open || !rect) return null;

  // Altura disponível no viewport — menu rola internamente se passar disso.
  const margin = 8;
  const viewportH =
    typeof window !== "undefined" ? window.innerHeight : 800;
  const spaceBelow = viewportH - rect.bottom - margin;
  const spaceAbove = rect.top - margin;
  const idealH = 420;
  const preferBelow = spaceBelow >= Math.min(240, idealH) || spaceBelow >= spaceAbove;
  const available = preferBelow ? spaceBelow : spaceAbove;
  const maxHeight = Math.max(160, Math.min(idealH, available));
  const { left } = computePopoverPosition(rect, maxHeight, 208, margin);
  const top = preferBelow
    ? rect.bottom + 4
    : Math.max(margin, rect.top - maxHeight - 4);

  return createPortal(
    <div
      ref={menuRef}
      style={{ top, left, maxHeight }}
      className="scrollbar-thin fixed z-[60] w-52 overflow-y-auto overscroll-contain rounded-xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[0_8px_28px_rgba(15,23,42,0.13)] [-webkit-overflow-scrolling:touch] v2-dark:shadow-[0_8px_28px_rgba(0,0,0,0.55)]"
    >
      {onNewDeal && (
        <>
          <button
            type="button"
            onClick={onNewDeal}
            className="flex w-full items-center gap-2.5 px-3 pb-2 pt-3 text-left font-display text-[12.5px] font-bold text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/8"
          >
            <IconPlus size={14} stroke={2.6} className="shrink-0" />
            Adicionar negócio
          </button>
          <div className="mx-3 my-1 h-px bg-[var(--glass-border-subtle)]" />
        </>
      )}

      {/* Seção: seleção */}
      <button
        type="button"
        onClick={onToggleSelectionMode}
        className={cn(
          "flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-semibold transition-colors",
          selectionMode
            ? "bg-[var(--brand-primary)]/8 text-[var(--brand-primary)]"
            : "text-[var(--text-secondary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
        )}
      >
        <IconCheckbox size={13} className="shrink-0" />
        {selectionMode ? "Sair da seleção" : "Selecionar..."}
      </button>

      <div className="mx-3 my-1.5 h-px bg-[var(--glass-border-subtle)]" />

      {/* Seção: dados */}
      <div className="px-3 pb-1 pt-1">
        <p className="font-display text-[9.5px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
          Dados
        </p>
      </div>
      <RequirePermission permission="deal:import">
        <button
          type="button"
          onClick={onImport}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
        >
          <IconUpload size={13} className="shrink-0" />
          Importar CSV
        </button>
      </RequirePermission>
      <RequirePermission permission="deal:export">
        <button
          type="button"
          onClick={onExport}
          className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
        >
          <IconDownload size={13} className="shrink-0" />
          Exportar CSV
        </button>
      </RequirePermission>

      <div className="mx-3 my-1.5 h-px bg-[var(--glass-border-subtle)]" />

      {/* Seção: pipeline */}
      <button
        type="button"
        onClick={onChannels}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left font-display text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
      >
        <IconAntenna size={13} className="shrink-0" />
        Canais do funil
      </button>
      <button
        type="button"
        onClick={onSettings}
        className="flex w-full items-center gap-2.5 px-3 py-2 pb-3 text-left font-display text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
      >
        <IconSettings size={13} className="shrink-0" />
        Configurar pipeline
      </button>
    </div>,
    document.body,
  );
}

// ─── ImportExportModal ────────────────────────────────────────────

interface ImportExportModalProps {
  activeTab: "import" | "export";
  onClose: () => void;
  bump: () => void;
  /** Funil + filtros ativos: habilita "exportar só a base filtrada". */
  exportScope?: ExportScope;
}

function ImportExportModal({ activeTab, onClose, bump, exportScope }: ImportExportModalProps) {
  return (
    <div
      className="fixed inset-0 z-(--z-modal) flex items-center justify-center bg-black/25 px-4 py-4 backdrop-blur-[2px] sm:px-6 sm:py-6"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[1320px] max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)] shadow-[0_24px_60px_rgba(15,23,42,0.18)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--glass-border)] bg-[var(--dropdown-solid-bg)]/95 px-6 py-5 backdrop-blur-sm sm:px-8">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--brand-primary)]/10">
              {activeTab === "import"
                ? <IconUpload size={20} className="text-[var(--brand-primary)]" />
                : <IconDownload size={20} className="text-[var(--brand-primary)]" />
              }
            </div>
            <div>
              <h2 className="font-display text-[17px] font-bold text-[var(--text-primary)]">
                {activeTab === "import" ? "Importar negócios" : "Exportar dados"}
              </h2>
              <p className="mt-0.5 font-body text-[13px] text-[var(--text-muted)]">
                {activeTab === "import"
                  ? "CSV de negócios — contatos são criados automaticamente quando nome + email/telefone são informados"
                  : "Baixar base em CSV"}
              </p>
            </div>
          </div>
          <TooltipGlass label="Fechar" side="left">
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            >
              <IconX size={17} />
            </button>
          </TooltipGlass>
        </div>

        {/* Conteúdo */}
        <div className="p-6 sm:p-8">
          {activeTab === "import"
            ? <ImportPanel fixedEntity="deals" onDone={() => { bump(); onClose(); }} />
            : <ExportPanel scope={exportScope} />
          }
        </div>
      </div>
    </div>
  );
}
