"use client";

/**
 * DealQueue — Fila unificada de deals (Sales Hub).
 * ───────────────────────────────────────────────────────────────
 * Os itens da fila são o MESMO `DealCard` do kanban do `/pipeline`
 * (`components/crm/deal-card`), alimentado pelo mesmo adapter
 * (`toDealCard`). Antes a fila desenhava um card próprio, minimalista,
 * que destoava visualmente dos cards de negócio.
 *
 * Seleção = deal em foco no chat (`isSelected`). Expandir/recolher o
 * chrome do card é independente: 1º clique seleciona + amplia; 2º clique
 * no mesmo card reduz o chrome sem fechar o chat. Tags/responsável usam
 * os popovers do kanban; demais campos CRM ficam no DealDetailPanel.
 */

import { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  IconArrowsUpDown as ArrowUpDown,
  IconCheck as Check,
  IconChevronDown as ChevronDown,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { BoardDeal } from "@/components/pipeline/kanban-types";
import type { BoardStage } from "@/components/pipeline/kanban-board";
import { SUBTLE_SPRING } from "@/lib/design-system";
import { AppLoading } from "@/components/crm/app-loading";
import { Chip } from "@/components/crm/chip";
import { DealCard } from "@/components/crm/deal-card";
import { TagChip } from "@/components/crm/tag-chip";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { UserAvatar } from "@/components/crm/user-avatar";
import { DealMoveStageButton } from "@/components/sales-hub/deal-actions";
import { toDealCard } from "@/features/pipeline-v2/adapters";
import type { BoardDealDto } from "@/features/pipeline-v2/api";
import {
  AssigneePopover,
  DealCardTagsTrigger,
  TagsPopover,
} from "@/features/pipeline-v2/extras";
import { TooltipHost } from "@/components/ui/tooltip";
import {
  computePopoverPosition,
  usePortalPopover,
} from "@/features/pipeline-v2/extras/use-portal-popover";

type StatusFilter = "OPEN" | "WON" | "LOST" | "ALL";
export type DealQueueSortMode =
  | "message_new"
  | "message_old"
  | "created_new"
  | "created_old";

const SORT_LABELS: Record<DealQueueSortMode, string> = {
  message_new: "Mensagem mais recente",
  message_old: "Mensagem mais antiga",
  created_new: "Criação mais recente",
  created_old: "Criação mais antiga",
};

const SORT_HINTS: Record<DealQueueSortMode, string> = {
  message_new: "Quem respondeu por último no topo",
  message_old: "Quem está esperando há mais tempo no topo",
  created_new: "Leads novos no topo",
  created_old: "Leads mais antigos no topo",
};

/** Filtro local da fila (nome, e-mail, telefone, título do negócio). */
export function filterDealsForQueueSearch(
  deals: (BoardDeal & { stageId: string })[],
  q: string,
): (BoardDeal & { stageId: string })[] {
  const t = q.trim().toLowerCase();
  if (!t) return deals;
  return deals.filter((d) => {
    const name = (d.contact?.name ?? d.title).toLowerCase();
    return (
      name.includes(t) ||
      (d.contact?.email ?? "").toLowerCase().includes(t) ||
      (d.contact?.phone ?? "").toLowerCase().includes(t) ||
      d.title.toLowerCase().includes(t)
    );
  });
}

/**
 * Dropdown de ordenação da fila (Pipeline Ágil).
 * `iconOnly` — botão quadrado só com ícone (ex.: ao lado da busca na coluna).
 * `compact` — rótulo curto no header (legado); ignorado se `iconOnly`.
 */
export function DealQueueSortMenu({
  sortMode,
  onSortModeChange,
  compact = false,
  iconOnly = false,
}: {
  sortMode: DealQueueSortMode;
  onSortModeChange: (mode: DealQueueSortMode) => void;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const { open, rect, triggerRef, popoverRef, toggle, close } =
    usePortalPopover();
  const position = computePopoverPosition(rect, 220, 240);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <div className="relative shrink-0">
      <TooltipHost label={`Ordenar — ${SORT_LABELS[sortMode]}`} side="top">
        <button
          ref={triggerRef}
          type="button"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={`Ordenar fila: ${SORT_LABELS[sortMode]}`}
          className={cn(
            "inline-flex items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] font-semibold tracking-tight text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-strong)]",
            iconOnly
              ? "size-8 shrink-0 p-0"
              : cn(
                  compact
                    ? "gap-1 px-2 py-1 text-[10px]"
                    : "gap-1.5 px-2.5 py-1.5 text-[12px]",
                ),
            open &&
              "border-[var(--brand-primary)]/40 ring-[3px] ring-[var(--brand-primary)]/15",
          )}
        >
          <ArrowUpDown
            className={cn(
              "text-[var(--text-muted)]",
              iconOnly ? "size-3.5" : compact ? "size-3" : "size-3.5",
            )}
            strokeWidth={2.2}
          />
          {!iconOnly ? (
            <>
              <span
                className={cn(
                  "truncate",
                  compact
                    ? "max-w-[120px] sm:max-w-[160px]"
                    : "max-w-[160px] sm:max-w-[200px]",
                )}
              >
                {SORT_LABELS[sortMode]}
              </span>
              <ChevronDown
                className={cn(
                  "size-3 text-[var(--text-muted)] transition-transform",
                  open && "rotate-180",
                )}
                strokeWidth={2.5}
              />
            </>
          ) : null}
        </button>
      </TooltipHost>
      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="listbox"
              className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-white shadow-[0_12px_32px_rgba(15,23,42,0.18)] v2-dark:bg-[#1a1f2e] v2-dark:shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: 240,
                zIndex: "var(--z-popover)",
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {(Object.keys(SORT_LABELS) as DealQueueSortMode[]).map((mode) => {
                const isActive = mode === sortMode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      onSortModeChange(mode);
                      close();
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left transition-colors",
                      isActive
                        ? "bg-[var(--color-enterprise-bg)]"
                        : "hover:bg-[var(--glass-bg-strong)]",
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-3.5 shrink-0",
                        isActive
                          ? "text-[var(--brand-primary)]"
                          : "text-transparent",
                      )}
                      strokeWidth={2.5}
                    />
                    <div className="min-w-0">
                      <div
                        className={cn(
                          "truncate font-display text-[13px] font-semibold tracking-tight",
                          isActive
                            ? "text-[var(--brand-primary)]"
                            : "text-[var(--text-primary)]",
                        )}
                      >
                        {SORT_LABELS[mode]}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {SORT_HINTS[mode]}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

type DealQueueProps = {
  deals: (BoardDeal & { stageId: string })[];
  stages: BoardStage[];
  activeDealId: string | null;
  onSelectDeal: (dealId: string) => void;
  /**
   * Fecha o deal em foco (chat). O 2º clique no card agora só recolhe
   * o chrome; quem chama `onDeselect` é o botão Fechar / atalhos do host.
   */
  onDeselect?: () => void;
  /**
   * ID do deal recém-movido. Renderizado com highlight sutil por
   * ~1.5s pra ajudar o operador a localizar visualmente o card que
   * "pulou" de etapa quando o quick-move é disparado dos botões.
   */
  recentlyMovedDealId?: string | null;
  /** Quando muda, a fila volta ao topo para a nova ordem ficar visível. */
  sortMode?: DealQueueSortMode;
  /**
   * Paginação de rede (board em 50/etapa): true quando alguma etapa
   * ainda tem deals no servidor. Esgotada a janela local, o sentinel
   * dispara `onLoadMore` em vez de só crescer a janela.
   */
  hasMoreServer?: boolean;
  /** Cards que ainda faltam no servidor (totalCount − loaded). */
  remainingCount?: number;
  loadingMore?: boolean;
  /** Board sem dados ainda — skeleton em vez de "Nenhum deal encontrado". */
  isLoading?: boolean;
  onLoadMore?: () => void;
  /**
   * Etapa filtrada (`null` = Todos). Quando muda, a fila volta ao topo
   * e o auto-select do primeiro lead não dispara scrollIntoView.
   */
  selectedStageId?: string | null;
  /**
   * Incrementado só em troca explícita de etapa (ribbon / atalho).
   * Dispara limpeza → cards novos; sync automático de etapa não usa.
   */
  stageSwitchToken?: number;
  /** Mantidos na API pública (host / SalesHubView); CRM vive na Sheet. */
  pipelineId: string;
  statusFilter?: StatusFilter;
  onMoved?: (dealId: string) => void;
  onOpenFullDeal?: (dealId: string) => void;
};

// ── Item da fila ────────────────────────────────────────────────
// Wrapper fino em volta do `DealCard` real do kanban: adiciona só a
// animação de entrada/saída da fila e o realce de "recém-movido".
// Unread fica no próprio DealCard (mesmo visual Kanban + Flow).
function DealQueueItem({
  deal,
  stages,
  isActive,
  isExpanded,
  onToggle,
  wasRecentlyMoved,
  pipelineId,
  statusFilter = "OPEN",
  onMoved,
  /** Troca de etapa: só fade, sem y — evita flash “sujo” na remount. */
  softEnter = false,
}: {
  deal: BoardDeal & { stageId: string };
  stages: BoardStage[];
  isActive: boolean;
  isExpanded: boolean;
  onToggle: (dealId: string) => void;
  wasRecentlyMoved: boolean;
  pipelineId: string;
  statusFilter?: StatusFilter;
  onMoved?: (dealId: string) => void;
  softEnter?: boolean;
}) {
  const vm = toDealCard(deal as unknown as BoardDealDto);
  const allTags = deal.tags ?? [];
  // Excedente não vira mais chip "+N": a lista completa (e a remoção) vive
  // no popover "Gerenciar tags", na seção "Selecionadas".
  const MAX_VISIBLE = 2;
  const visibleTags = allTags.slice(0, MAX_VISIBLE);

  // Sem `layout` / popLayout: ao abrir o chat a coluna estreita e o
  // layout animation da fila brigava com height do card (jank).

  return (
    <motion.div
      initial={softEnter ? { opacity: 0 } : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={softEnter ? undefined : { opacity: 0 }}
      transition={
        softEnter
          ? { duration: 0.18, ease: [0.32, 0.72, 0, 1] }
          : SUBTLE_SPRING
      }
      className={cn(
        "relative rounded-xl",
        wasRecentlyMoved && !isActive && "ring-2 ring-[var(--brand-primary)]/25",
      )}
    >
      <DealCard
        deal={vm}
        isSelected={isActive}
        compact={isActive && !isExpanded}
        onClick={() => onToggle(deal.id)}
        // Flow: uma linha só (nowrap). Nunca `two-col` — grid cria 2 linhas e infla o card.
        tagsWrap={false}
        // Com tags: chips + `+` no canto direito. Sem tags: + ao lado
        // do responsável (tagsAddSlot).
        tagsSlot={
          allTags.length > 0 ? (
            <>
              {visibleTags.map((t) => (
                <TooltipGlass key={t.id} label={t.name} side="top">
                  <TagChip
                    name={t.name}
                    color={t.color}
                    className="max-w-[9.5rem] min-w-0 shrink"
                  />
                </TooltipGlass>
              ))}
            </>
          ) : undefined
        }
        tagsAddSlot={
          <TagsPopover
            dealId={deal.id}
            currentTags={allTags}
            pipelineId={pipelineId}
            statusFilter={statusFilter}
            trigger={<DealCardTagsTrigger hasTags={allTags.length > 0} />}
          />
        }
        // Mesmo padrão do kanban: AssigneePopover + pill / avatar+nome.
        ownerSlot={
          <AssigneePopover
            dealId={deal.id}
            currentOwnerId={deal.owner?.id ?? null}
            currentOwnerName={deal.owner?.name ?? null}
            pipelineId={pipelineId}
            statusFilter={statusFilter}
            trigger={
              deal.owner?.name ? (
                <span
                  className="inline-flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] py-px pl-px pr-2 transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--glass-bg-base)]"
                  title={deal.owner.name}
                >
                  <UserAvatar
                    name={deal.owner.name}
                    imageUrl={deal.owner.avatarUrl ?? null}
                    size={22}
                  />
                  <span className="min-w-0 truncate font-display text-[10.5px] font-semibold text-[var(--text-secondary)]">
                    {deal.owner.name}
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
        // Mover de fase por card (igual kanban) — antes vivia no header
        // da fila e só agia sobre o deal ativo.
        moveMenuSlot={
          <DealMoveStageButton
            deal={deal}
            stages={stages}
            pipelineId={pipelineId}
            statusFilter={statusFilter}
            onMoved={onMoved}
          />
        }
      />
    </motion.div>
  );
}

// ── Main Queue ───────────────────────────────────────────────────

export function DealQueue({
  deals,
  stages,
  activeDealId,
  onSelectDeal,
  recentlyMovedDealId,
  sortMode,
  hasMoreServer = false,
  remainingCount = 0,
  loadingMore = false,
  isLoading = false,
  onLoadMore,
  selectedStageId,
  stageSwitchToken = 0,
  pipelineId,
  statusFilter = "OPEN",
  onMoved,
}: DealQueueProps) {
  // Mantem o card ativo sempre visivel na fila — quando a selecao
  // muda, rola suave pro card novo ficar no viewport.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLElement>());
  // Troca de etapa auto-seleciona o 1º lead (ordem do board, não a
  // fila ordenada). scrollIntoView nesse caso pula pro card — às vezes
  // o último após sort. Skip uma vez e mostra o topo.
  const skipScrollIntoViewRef = useRef(false);
  // Chrome expandido do card — separado do deal em foco no chat.
  const [expandedDealId, setExpandedDealId] = useState<string | null>(
    () => activeDealId,
  );
  const prevActiveDealIdRef = useRef<string | null>(activeDealId);
  // Token “commitado” na UI — enquanto divergir do prop, fila fica limpa
  // (síncrono no render; sem 1 frame de cards antigos).
  const [renderedSwitchToken, setRenderedSwitchToken] = useState(stageSwitchToken);
  const [softEnterWave, setSoftEnterWave] = useState(false);
  const isStageSwitching = renderedSwitchToken !== stageSwitchToken;
  const stageListKey = `${selectedStageId ?? "all"}:${renderedSwitchToken}`;

  // Novo deal selecionado (ou limpo via X): sincroniza expansão.
  // Não forçar expand em todo render — o 2º clique só recolhe o chrome.
  useEffect(() => {
    if (activeDealId === prevActiveDealIdRef.current) return;
    prevActiveDealIdRef.current = activeDealId;
    setExpandedDealId(activeDealId);
  }, [activeDealId]);

  const handleToggleDeal = (dealId: string) => {
    if (activeDealId !== dealId) {
      onSelectDeal(dealId);
      setExpandedDealId(dealId);
      return;
    }
    // Mesmo deal com chat aberto: amplia ↔ reduz o card (chat permanece).
    setExpandedDealId((cur) => (cur === dealId ? null : dealId));
  };

  // Troca de ordenação: lista do topo (ordem nova), sem pular pro deal ativo.
  useEffect(() => {
    if (sortMode === undefined) return;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
  }, [sortMode]);

  // Troca de etapa / Todos (ribbon): topo da fila; não scrollIntoView no auto-select.
  useEffect(() => {
    if (selectedStageId === undefined) return;
    skipScrollIntoViewRef.current = true;
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
    queueMicrotask(() => {
      skipScrollIntoViewRef.current = false;
    });
  }, [selectedStageId]);

  // Só limpa→recarrega em troca explícita (token), não no sync automático.
  useEffect(() => {
    if (!isStageSwitching) return;

    skipScrollIntoViewRef.current = true;
    setSoftEnterWave(true);
    if (scrollerRef.current) scrollerRef.current.scrollTop = 0;

    const showTimer = window.setTimeout(() => {
      setRenderedSwitchToken(stageSwitchToken);
      if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
      queueMicrotask(() => {
        skipScrollIntoViewRef.current = false;
      });
    }, 70);

    const softTimer = window.setTimeout(() => {
      setSoftEnterWave(false);
    }, 320);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(softTimer);
    };
  }, [isStageSwitching, stageSwitchToken]);

  useEffect(() => {
    if (!activeDealId) return;
    if (skipScrollIntoViewRef.current) {
      skipScrollIntoViewRef.current = false;
      if (scrollerRef.current) scrollerRef.current.scrollTop = 0;
      return;
    }
    const el = itemRefs.current.get(activeDealId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeDealId]);

  const visibleDeals = isStageSwitching ? [] : deals;

  // Windowing: monta no DOM só o início da fila e cresce +60 quando o
  // sentinel entra no viewport. Com funis grandes (500+ deals), evita
  // montar centenas de cards (e suas mídias/avatars) de uma vez — a
  // fila renderiza sob demanda conforme o scroll.
  const QUEUE_PAGE = 60;
  const [renderLimit, setRenderLimit] = useState(QUEUE_PAGE);
  const lastNetworkLoadAtCountRef = useRef(-1);
  // Troca de etapa/ordenação já rola pro topo — a janela volta ao início.
  useEffect(() => {
    setRenderLimit(QUEUE_PAGE);
    lastNetworkLoadAtCountRef.current = -1;
  }, [stageListKey, sortMode]);
  // Deep-link/navegação por teclado: garante que o deal ativo esteja
  // dentro da janela renderizada (senão o scrollIntoView não tem alvo).
  const activeIdx = activeDealId
    ? deals.findIndex((d) => d.id === activeDealId)
    : -1;
  const effectiveLimit = Math.max(renderLimit, activeIdx + 1);
  const windowedDeals = visibleDeals.slice(0, effectiveLimit);
  const hasMoreToRender = visibleDeals.length > effectiveLimit;
  const queueSentinelRef = useRef<HTMLDivElement>(null);
  // Dois níveis: 1º janela local (+60); depois rede (+50/etapa).
  // Sentinel permanece montado durante o fetch (antes sumia e o IO
  // era destruído). Scroll listener cobre o caso em que o root do
  // observer não é o scroller real ou o alvo h-px não intersecta.
  const showQueueSentinel = hasMoreToRender || hasMoreServer;
  const hasMoreToRenderRef = useRef(hasMoreToRender);
  hasMoreToRenderRef.current = hasMoreToRender;
  const hasMoreServerRef = useRef(hasMoreServer);
  hasMoreServerRef.current = hasMoreServer;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const visibleCountRef = useRef(visibleDeals.length);
  visibleCountRef.current = visibleDeals.length;
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !showQueueSentinel) return;

    const maybeLoad = () => {
      if (hasMoreToRenderRef.current) {
        setRenderLimit((n) => n + QUEUE_PAGE);
        return;
      }
      if (!hasMoreServerRef.current || loadingMoreRef.current) return;
      if (lastNetworkLoadAtCountRef.current === visibleCountRef.current) return;
      lastNetworkLoadAtCountRef.current = visibleCountRef.current;
      onLoadMoreRef.current?.();
    };

    const onScroll = () => {
      const gap = root.scrollHeight - root.scrollTop - root.clientHeight;
      if (gap < 360) maybeLoad();
    };
    root.addEventListener("scroll", onScroll, { passive: true });

    const el = queueSentinelRef.current;
    const io = el
      ? new IntersectionObserver(
          (entries) => {
            if (entries[0]?.isIntersecting) maybeLoad();
          },
          { root, rootMargin: "400px 0px", threshold: 0 },
        )
      : null;
    if (el && io) io.observe(el);

    const raf = requestAnimationFrame(() => {
      if (root.scrollHeight <= root.clientHeight + 8) maybeLoad();
    });

    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, [showQueueSentinel, windowedDeals.length, visibleDeals.length]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-transparent">
      <div
        ref={scrollerRef}
        // pt extra: hover -translate-y do 1º card não clipa no header da fila.
        className="scrollbar-thin min-h-0 flex-1 overflow-x-clip overflow-y-auto overscroll-contain px-2 pb-2 pt-3"
      >
        <div className="flex flex-col gap-2" key={stageListKey}>
          {isStageSwitching ? (
            <div
              className="flex min-h-[200px] items-center justify-center py-8"
              aria-busy="true"
              aria-label="Carregando etapa"
            >
              <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <AnimatePresence initial={softEnterWave}>
              {windowedDeals.map((deal) => {
                const isActive = activeDealId === deal.id;
                const isExpanded = expandedDealId === deal.id;
                const wasRecentlyMoved = recentlyMovedDealId === deal.id;

                return (
                  <div
                    key={deal.id}
                    ref={(el) => {
                      if (el) itemRefs.current.set(deal.id, el);
                      else itemRefs.current.delete(deal.id);
                    }}
                  >
                    <DealQueueItem
                      deal={deal}
                      stages={stages}
                      isActive={isActive}
                      isExpanded={isExpanded}
                      onToggle={handleToggleDeal}
                      wasRecentlyMoved={wasRecentlyMoved}
                      pipelineId={pipelineId}
                      statusFilter={statusFilter}
                      onMoved={onMoved}
                      softEnter={softEnterWave}
                    />
                  </div>
                );
              })}
            </AnimatePresence>
          )}
          {!isStageSwitching && showQueueSentinel && (
            <div ref={queueSentinelRef} className="shrink-0 pt-1">
              {hasMoreServer && !hasMoreToRender ? (
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => {
                    lastNetworkLoadAtCountRef.current = -1;
                    onLoadMore?.();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/30 bg-primary/5 py-2 text-[11px] font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 disabled:opacity-60"
                >
                  {loadingMore
                    ? "Carregando…"
                    : remainingCount > 0
                      ? `Carregar mais (${remainingCount})`
                      : "Carregar mais"}
                </button>
              ) : (
                <div aria-hidden className="h-8" />
              )}
            </div>
          )}
          {!isStageSwitching && visibleDeals.length === 0 && (
            isLoading ? (
              <AppLoading variant="inline" />
            ) : (
              <p className="px-2 py-8 text-center text-xs text-[var(--text-muted)]">
                Nenhum deal encontrado
              </p>
            )
          )}
        </div>
      </div>
    </div>
  );
}
