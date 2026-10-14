"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
} from "@tabler/icons-react";

import { EmptyState } from "@/components/crm/empty-state";
import { cn } from "@/lib/utils";

export type PipelineProgressStage = {
  id: string;
  name: string;
  color: string;
  count: number;
  value: number;
  entered: number;
  lost: number;
  /** Coorte Painel: % que avançou para a próxima etapa. */
  passThrough?: number | null;
  href?: string;
  /**
   * Saíram da etapa no período (inclui Perdido/Ganho e outros funis).
   * Presente = mostra entraram, saíram e as perdas para Perdido.
   * Ausente (backend antigo) = coluna como antes.
   */
  exited?: number;
  /** Origens de quem entrou, já com rótulo ("de Qualificação", "criados aqui"). */
  inflow?: PipelineProgressFlowRow[];
  /** Destinos de quem saiu ("para Proposta", "para Perdido"). */
  outflow?: PipelineProgressFlowRow[];
};

export type PipelineProgressFlowRow = { key: string; label: string; count: number };

const ENTERED_TITLE =
  "Negócios que chegaram a esta etapa no período — criados nela ou movidos de outra.";
const LOST_FROM_STAGE_TITLE =
  "Negócios desta etapa que foram para Perdido no período.";

export type PipelineProgressSummary = {
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  /**
   * `lostCount`/`lostValue` são o estoque de hoje nas etapas Perdido do
   * funil (não as perdas do período). Ausente = comportamento antigo.
   */
  lostIsStock?: boolean;
  /** Negócios movidos para Perdido dentro do período (só com `lostIsStock`). */
  lostSentInPeriod?: number;
  href?: string;
  /** Link de "Perdidos" (coluna Perdido no Kanban); ausente = `href`. */
  lostHref?: string;
};

const LOST_STOCK_TITLE =
  "Negócios que estão hoje nas etapas Perdido deste funil, inclusive os já encerrados que o Kanban esconde por padrão. '+N enviados' são os movidos para Perdido no período.";

export type PipelineProgressCohort = {
  count: number;
  value: number;
  open: number;
  won: number;
  lost: number;
};

export type PipelineProgressPeriod = {
  from: string;
  to: string;
  /** Nome do filtro (Hoje, Ontem, Últimos 7 dias). */
  label?: string;
};

const numberFmt = new Intl.NumberFormat("pt-BR");
const currencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const compactCurrencyFmt = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
});

function formatCount(value: number) {
  return numberFmt.format(value);
}

function formatMoney(value: number) {
  return Math.abs(value) >= 1000
    ? compactCurrencyFmt.format(value)
    : currencyFmt.format(value);
}

function formatDay(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : dateFmt.format(d);
}

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}

function MetricLink({
  href,
  children,
  className,
}: {
  href?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (!href) return <div className={className}>{children}</div>;
  return (
    <Link href={href} className={cn("min-w-0 outline-none", className)}>
      {children}
    </Link>
  );
}

function FlowList({
  title,
  total,
  rows,
  hint,
  empty,
}: {
  title: string;
  total: number;
  rows: PipelineProgressFlowRow[];
  hint?: string;
  empty: string;
}) {
  return (
    <section>
      <h4 className="font-display text-[12px] font-bold text-[var(--pipeline-text)]">
        {`${title} (${formatCount(total)})`}
      </h4>
      {hint ? (
        <p className="mt-0.5 font-body text-[11px] leading-snug text-[var(--pipeline-text-muted)]">
          {hint}
        </p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="mt-1.5 flex flex-col gap-1">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-baseline justify-between gap-3 font-body text-[12px] text-[var(--pipeline-text-secondary)]"
            >
              <span className="min-w-0 break-words">{row.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-[var(--pipeline-text)]">
                {formatCount(row.count)}
              </span>
            </li>
          ))}
        </ul>
      ) : total === 0 ? (
        <p className="mt-1 font-body text-[12px] text-[var(--pipeline-text-muted)]">{empty}</p>
      ) : null}
    </section>
  );
}

type FlowOpen = false | "hover" | "pinned";

const POPOVER_WIDTH = 264;
const POPOVER_GAP = 6;

/**
 * "+N entraram · −M saíram · N perdas" com o detalhe de origens e destinos:
 * passar o mouse mostra; clicar/tocar/Enter fixa e leva o foco ao popover;
 * Esc fecha e devolve o foco ao botão. O popover vai para o `body` porque o
 * trilho do funil corta o que passa da altura da coluna.
 */
function StageFlow({ stage }: { stage: PipelineProgressStage }) {
  const entered = Math.max(0, stage.entered);
  const exited = Math.max(0, stage.exited ?? 0);
  const lost = Math.max(0, stage.lost);
  const popoverId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<FlowOpen>(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number }>({
    left: 0,
    top: 0,
  });

  const place = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn || typeof window === "undefined") return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const left = Math.max(8, Math.min(rect.left, vw - POPOVER_WIDTH - 8));
    const below = vh - rect.bottom;
    if (below < 200 && rect.top > below) {
      setPos({ left, bottom: vh - rect.top + POPOVER_GAP });
    } else {
      setPos({ left, top: rect.bottom + POPOVER_GAP });
    }
  }, []);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);

  const pin = useCallback(() => {
    place();
    setOpen("pinned");
  }, [place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside =
        popoverRef.current?.contains(document.activeElement) ||
        buttonRef.current === document.activeElement;
      close(Boolean(inside));
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, close, place]);

  useEffect(() => {
    if (open === "pinned") popoverRef.current?.focus();
  }, [open]);

  const toggle = () => {
    if (open === "pinned") close(true);
    else pin();
  };

  const summary = `${formatCount(entered)} ${entered === 1 ? "entrou" : "entraram"}, ${formatCount(exited)} ${exited === 1 ? "saiu" : "saíram"}, ${formatCount(lost)} ${lost === 1 ? "perda" : "perdas"}`;

  return (
    <div className="mt-auto">
      <button
        ref={buttonRef}
        type="button"
        data-funnel-flow={stage.id}
        aria-expanded={open !== false}
        aria-haspopup="dialog"
        aria-controls={open ? popoverId : undefined}
        aria-label={`${stage.name}: ${summary}. Ver origens e destinos`}
        onPointerEnter={(e) => {
          if (e.pointerType !== "mouse" || open === "pinned") return;
          place();
          setOpen("hover");
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse" && open === "hover") setOpen(false);
        }}
        onKeyDown={(e) => {
          // Enter tratado aqui (o navegador também dispararia `click`).
          if (e.key !== "Enter") return;
          e.preventDefault();
          toggle();
        }}
        onClick={toggle}
        className="w-full rounded-[var(--radius-md)] border border-[var(--pipeline-border)] bg-[var(--pipeline-surface)] px-2.5 py-2 text-left outline-none hover:border-[var(--pipeline-control-hover)] focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <span className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "font-display text-[16px] font-bold leading-tight tabular-nums",
                entered > 0
                  ? "text-[var(--pipeline-success)]"
                  : "text-[var(--pipeline-text-muted)]",
              )}
            >
              {entered > 0 ? `+${formatCount(entered)}` : "0"}
            </span>
            <span
              className="font-body text-[11px] text-[var(--pipeline-text-muted)]"
              title={ENTERED_TITLE}
            >
              {entered === 1 ? "entrou" : "entraram"}
            </span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className={cn(
                "font-display text-[16px] font-bold leading-tight tabular-nums",
                exited > 0
                  ? "text-[var(--pipeline-text-secondary)]"
                  : "text-[var(--pipeline-text-muted)]",
              )}
            >
              {exited > 0 ? `−${formatCount(exited)}` : "0"}
            </span>
            <span className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
              {exited === 1 ? "saiu" : "saíram"}
            </span>
          </span>
        </span>
        <span
          data-funnel-lost
          title={LOST_FROM_STAGE_TITLE}
          className={cn(
            "mt-1 block font-body text-[11px] tabular-nums",
            lost > 0
              ? "font-semibold text-[var(--pipeline-danger)]"
              : "text-[var(--pipeline-text-muted)]",
          )}
        >
          {`${formatCount(lost)} ${lost === 1 ? "perda" : "perdas"}`}
        </span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label={`Entradas e saídas: ${stage.name}`}
              tabIndex={-1}
              onKeyDown={(e) => {
                // Popover fica no fim do `body`: Tab volta ao botão em vez de
                // pular para fora da página.
                if (e.key !== "Tab") return;
                e.preventDefault();
                close(true);
              }}
              className={cn(
                "fixed z-[100] flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--pipeline-border)] bg-[var(--pipeline-surface)] p-3 text-[var(--pipeline-text)] shadow-[var(--pipeline-shadow)] outline-none",
                open === "hover" && "pointer-events-none",
              )}
              style={{
                width: POPOVER_WIDTH,
                maxWidth: "calc(100vw - 16px)",
                left: pos.left,
                top: pos.top,
                bottom: pos.bottom,
              }}
            >
              <FlowList
                title="Entraram"
                total={entered}
                rows={stage.inflow ?? []}
                hint={ENTERED_TITLE}
                empty="Nenhuma entrada no período."
              />
              <FlowList
                title="Saíram"
                total={exited}
                rows={stage.outflow ?? []}
                empty="Nenhuma saída no período."
              />
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function StageColumn({ stage }: { stage: PipelineProgressStage }) {
  return (
    <article className="pipeline-progress-col">
      <span
        className="h-1.5 w-full rounded-full"
        style={{ background: stage.color || "var(--brand-primary)" }}
        aria-hidden
      />
      {/* Até 2 linhas (nomes longos como "Sem rematrícula" não viram "SEM REMATRÍCU…");
          o nome inteiro fica no title. */}
      <h3
        className="line-clamp-2 min-h-[2lh] break-words font-display text-[11px] font-bold uppercase leading-tight tracking-wide text-[var(--pipeline-text-muted)]"
        title={stage.name}
      >
        {stage.name}
      </h3>
      <MetricLink href={stage.href}>
        <p className="font-display text-[26px] font-bold leading-none tabular-nums text-[var(--pipeline-text)]">
          {formatCount(stage.count)}
        </p>
        <p className="mt-1 font-body text-[12px] text-[var(--pipeline-text-secondary)]">
          {formatMoney(stage.value)}
        </p>
      </MetricLink>
      {/* Com o fluxo do backend: entraram, saíram e perdas para Perdido.
          Sem ele: bloco "+N entraram" e "N perdas" como antes. */}
      {stage.exited != null ? (
        <StageFlow stage={stage} />
      ) : (
        <>
          <div className="mt-auto rounded-[var(--radius-md)] border border-[var(--pipeline-border)] bg-[var(--pipeline-surface)] px-2.5 py-2">
            {stage.entered > 0 ? (
              <>
                <p className="font-display text-[16px] font-bold tabular-nums text-[var(--pipeline-success)]">
                  {`+${formatCount(stage.entered)}`}
                </p>
                <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
                  {stage.entered === 1 ? "entrou" : "entraram"}
                </p>
              </>
            ) : stage.passThrough != null ? (
              <>
                <p className="font-display text-[16px] font-bold tabular-nums text-foreground">
                  {`${stage.passThrough.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`}
                </p>
                <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
                  passagem
                </p>
              </>
            ) : (
              <>
                <p className="font-display text-[16px] font-bold tabular-nums text-[var(--pipeline-text-muted)]">
                  0
                </p>
                <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
                  entraram
                </p>
              </>
            )}
          </div>
          <MetricLink
            href={stage.href}
            className={cn(
              "font-body text-[12px] tabular-nums",
              stage.lost > 0
                ? "font-semibold text-[var(--pipeline-danger)]"
                : "text-[var(--pipeline-text-muted)]",
            )}
          >
            {stage.lost > 0
              ? `${formatCount(stage.lost)} ${stage.lost === 1 ? "perda" : "perdas"}`
              : "0 perdas"}
          </MetricLink>
        </>
      )}
    </article>
  );
}

function FunnelSausage({
  stages,
  novosCount,
  showNovos = true,
}: {
  stages: PipelineProgressStage[];
  novosCount?: number;
  /** Falso com o fluxo do backend: os criados viram chip no cabeçalho. */
  showNovos?: boolean;
}) {
  const weights = stages.map((s) => Math.max(0, s.count));
  const total = weights.reduce((sum, n) => sum + n, 0);
  const label = stages
    .map((s) => `${s.name}: ${formatCount(s.count)}`)
    .join(", ");
  const novos = showNovos ? Math.max(0, novosCount ?? 0) : 0;

  return (
    <div className="flex items-center gap-3 px-4 pt-3">
      {showNovos ? (
        <div
          className="shrink-0 rounded-xl border border-border bg-card px-3 py-1.5 text-center"
          aria-label={`${formatCount(novos)} clientes novos no período`}
        >
          <p className="font-display text-[18px] font-bold leading-none tabular-nums text-[var(--pipeline-success)]">
            {novos > 0 ? `+${formatCount(novos)}` : "0"}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Novo
          </p>
        </div>
      ) : null}
      <div
        className="flex h-3.5 min-w-0 flex-1 overflow-hidden rounded-full bg-secondary"
        role="img"
        aria-label={
          total > 0
            ? `Distribuição do funil: ${label}${showNovos ? `. Novos: ${formatCount(novos)}` : ""}`
            : "Funil sem negócios no período"
        }
      >
        {novos > 0 ? (
          <span
            className="h-full min-w-[6px] bg-[var(--pipeline-success)]"
            style={{
              width: `${Math.max(4, total > 0 ? (novos / (total + novos)) * 100 : 12)}%`,
            }}
            title={`Novos: +${formatCount(novos)}`}
          />
        ) : null}
        {total > 0
          ? stages.map((stage, i) => {
              const pct = (weights[i]! / total) * (total / (total + novos || 1)) * 100;
              if (pct <= 0) return null;
              return (
                <span
                  key={stage.id}
                  className="h-full min-w-px"
                  style={{
                    width: `${pct}%`,
                    background: stage.color || "var(--brand-primary)",
                  }}
                  title={`${stage.name}: ${formatCount(stage.count)}`}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

function NovosColumn({
  count,
  value,
  caption,
}: {
  count: number;
  value: number;
  caption: string;
}) {
  return (
    <article className="pipeline-progress-col">
      <span className="h-1.5 w-full rounded-full bg-[var(--pipeline-success)]" aria-hidden />
      <h3 className="min-h-[2lh] truncate font-display text-[11px] font-bold uppercase leading-tight tracking-wide text-[var(--pipeline-text-muted)]">
        Novos
      </h3>
      <p className="font-display text-[26px] font-bold leading-none tabular-nums text-[var(--pipeline-success)]">
        {count > 0 ? `+${formatCount(count)}` : "0"}
      </p>
      <p className="mt-1 font-body text-[12px] text-[var(--pipeline-text-secondary)]">
        {formatMoney(value)}
      </p>
      <p className="mt-auto font-body text-[11px] text-[var(--pipeline-text-muted)]">
        {caption}
      </p>
    </article>
  );
}

function SummaryColumn({ summary }: { summary: PipelineProgressSummary }) {
  const sent = Math.max(0, summary.lostSentInPeriod ?? 0);
  return (
    <article className="pipeline-progress-col is-summary justify-between">
      <MetricLink href={summary.href}>
        <p className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--pipeline-text-muted)]">
          Ganhos
        </p>
        <p className="mt-2 font-display text-[26px] font-bold leading-none tabular-nums text-[var(--pipeline-success)]">
          {formatCount(summary.wonCount)}
        </p>
        <p className="mt-1 font-body text-[12px] text-[var(--pipeline-text-secondary)]">
          {formatMoney(summary.wonValue)}
        </p>
      </MetricLink>
      <MetricLink href={summary.lostHref ?? summary.href}>
        <p
          className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--pipeline-text-muted)]"
          title={summary.lostIsStock ? LOST_STOCK_TITLE : undefined}
        >
          Perdidos
        </p>
        <p className="mt-2 font-display text-[22px] font-bold leading-none tabular-nums text-[var(--pipeline-danger)]">
          {formatCount(summary.lostCount)}
        </p>
        <p className="mt-1 font-body text-[12px] text-[var(--pipeline-text-secondary)]">
          {formatMoney(summary.lostValue)}
        </p>
        {summary.lostIsStock ? (
          <>
            <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
              na etapa hoje
            </p>
            {sent > 0 ? (
              <p className="font-body text-[11px] font-semibold tabular-nums text-[var(--pipeline-danger)]">
                {`+${formatCount(sent)} ${sent === 1 ? "enviado" : "enviados"} no período`}
              </p>
            ) : null}
          </>
        ) : null}
      </MetricLink>
    </article>
  );
}

export function PipelineProgress({
  stages,
  summary,
  cohort,
  pipelineHref,
  period,
  novos,
  headerAction,
  sidebar,
}: {
  stages: PipelineProgressStage[];
  summary: PipelineProgressSummary;
  cohort?: PipelineProgressCohort;
  pipelineHref: string;
  period?: PipelineProgressPeriod;
  novos?: { count: number; value: number };
  headerAction?: ReactNode;
  /** Lista de funis (Kommo): cálculos à direita são só do pipeline ativo. */
  sidebar?: ReactNode;
}) {
  const labelId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    startScroll: 0,
    armed: false,
    active: false,
    moved: false,
  });
  const suppressClickRef = useRef(false);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [dragging, setDragging] = useState(false);

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 2);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener("scroll", updateEdges, { passive: true });
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      ro.disconnect();
    };
  }, [stages.length, updateEdges]);

  const scrollByDir = useCallback((dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = Math.round(el.clientWidth * 0.72);
    el.scrollBy({ left: dir * step, behavior: scrollBehavior() });
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Toque usa o scroll nativo (pan-x). No iPhone, capturar o pointer
    // e escrever scrollLeft compete com o Safari e o gesto não anda.
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const el = scrollerRef.current;
    if (!el) return;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startScroll: el.scrollLeft,
      armed: true,
      active: false,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollerRef.current;
    if (!d.armed || !el) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.active) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        d.armed = false;
        return;
      }
      d.active = true;
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    }
    d.moved = true;
    el.scrollLeft = d.startScroll - dx;
    e.preventDefault();
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = scrollerRef.current;
    if (d.active && el?.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }
    if (d.moved) suppressClickRef.current = true;
    d.armed = false;
    d.active = false;
    d.moved = false;
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      scrollByDir(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      scrollByDir(1);
    }
  };

  // Backend com o fluxo por etapa: "Criados" fica no espaço da lista de funis.
  // Sem o fluxo (backend antigo), o card fica como antes.
  const hasFlow = stages.some((s) => s.exited != null);
  const fromLabel = period ? formatDay(period.from) : "";
  const toLabel = period ? formatDay(period.to) : "";

  return (
    <section
      className="pipeline-progress group/pipeline"
      role="region"
      aria-labelledby={labelId}
    >
      <div className={cn(sidebar ? "flex min-h-0 items-stretch max-md:flex-col" : null)}>
      {sidebar ? (
        <aside className="w-[196px] shrink-0 border-r border-[var(--pipeline-border)] bg-[var(--pipeline-surface)]/40 py-2 max-md:w-full max-md:border-b max-md:border-r-0">
          {sidebar}
        </aside>
      ) : null}
      <div className="min-w-0 flex-1">
      <header className="flex items-start justify-between gap-3 border-b border-[var(--pipeline-border)] px-3.5 py-2.5">
        <div className="min-w-0">
          <h2
            id={labelId}
            className="font-display text-[14px] font-bold tracking-tight text-[var(--pipeline-text)]"
          >
            Funil e progresso
          </h2>
          <p className="mt-0.5 font-body text-[11px] text-[var(--pipeline-text-muted)]">
            {hasFlow
              ? "Estoque aberto, entradas e saídas por etapa"
              : "Estoque aberto, entradas e perdas por etapa"}
            {period?.label ? (
              <>
                {" · "}
                {period.label}
              </>
            ) : period && fromLabel && toLabel ? (
              <>
                {" · "}
                <time dateTime={period.from}>{fromLabel}</time>
                {" – "}
                <time dateTime={period.to}>{toLabel}</time>
              </>
            ) : null}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {headerAction}
          <Link
            href={pipelineHref}
            className="rounded-[var(--radius-md)] font-display text-[11px] font-semibold text-[var(--brand-primary)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
          >
            Pipeline
          </Link>
        </div>
      </header>

      {stages.length > 0 ? (
        <FunnelSausage stages={stages} novosCount={novos?.count} showNovos={!hasFlow} />
      ) : null}

      {stages.length === 0 ? (
        <EmptyState
          icon={<IconFilter size={24} />}
          title="Sem etapas neste funil"
          description="Selecione outro pipeline ou cadastre etapas."
          className="py-10"
        />
      ) : (
        <div className="relative min-w-0">
          <div
            ref={scrollerRef}
            tabIndex={0}
            role="region"
            aria-label="Etapas do funil"
            className={cn(
              "pipeline-progress-scroller outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]",
              dragging && "is-dragging",
            )}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onKeyDown={onKeyDown}
            onClickCapture={(e) => {
              if (!suppressClickRef.current) return;
              e.preventDefault();
              e.stopPropagation();
              suppressClickRef.current = false;
            }}
          >
            <div className="pipeline-progress-track">
              {novos && !hasFlow ? (
                <NovosColumn
                  count={novos.count}
                  value={novos.value}
                  caption={period?.label ?? "No período"}
                />
              ) : null}
              {stages.map((stage) => (
                <StageColumn key={stage.id} stage={stage} />
              ))}
              <SummaryColumn summary={summary} />
            </div>
          </div>

          {/* Indica que há mais etapas para os lados (a barra de rolagem fina
              passava despercebida e a última etapa parecia cortada). */}
          {canPrev ? (
            <span
              aria-hidden
              data-funnel-fade="start"
              className="pointer-events-none absolute inset-y-0 left-0 z-[1] w-12 bg-gradient-to-r from-[var(--pipeline-surface)] via-[var(--pipeline-surface)]/70 to-transparent"
            />
          ) : null}
          {canNext ? (
            <span
              aria-hidden
              data-funnel-fade="end"
              className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-12 bg-gradient-to-l from-[var(--pipeline-surface)] via-[var(--pipeline-surface)]/70 to-transparent"
            />
          ) : null}
          {canPrev ? (
            <button
              type="button"
              aria-label="Ver etapas anteriores"
              onClick={() => scrollByDir(-1)}
              className="absolute left-2 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--pipeline-control)] text-[var(--pipeline-text)] opacity-80 shadow-[var(--pipeline-shadow)] outline-none transition-opacity hover:bg-[var(--pipeline-control-hover)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] group-hover/pipeline:opacity-100 group-focus-within/pipeline:opacity-100 motion-reduce:transition-none md:flex"
            >
              <IconChevronLeft size={18} stroke={2.2} />
            </button>
          ) : null}
          {canNext ? (
            <button
              type="button"
              aria-label="Ver próximas etapas"
              onClick={() => scrollByDir(1)}
              className="absolute right-2 top-1/2 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--pipeline-control)] text-[var(--pipeline-text)] opacity-80 shadow-[var(--pipeline-shadow)] outline-none transition-opacity hover:bg-[var(--pipeline-control-hover)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] group-hover/pipeline:opacity-100 group-focus-within/pipeline:opacity-100 motion-reduce:transition-none md:flex"
            >
              <IconChevronRight size={18} stroke={2.2} />
            </button>
          ) : null}
        </div>
      )}

      {cohort ? (
        <ul className="grid grid-cols-2 gap-px border-t border-[var(--pipeline-border)] bg-[var(--pipeline-border)] md:grid-cols-4">
          <li className="bg-[var(--pipeline-surface)] px-4 py-3">
            <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
              Novos no período
            </p>
            <p className="mt-0.5 font-display text-[18px] font-bold tabular-nums text-[var(--pipeline-success)]">
              {cohort.count > 0 ? `+${formatCount(cohort.count)}` : "0"}
            </p>
            <p className="font-body text-[11px] text-[var(--pipeline-text-secondary)]">
              {formatMoney(cohort.value)}
            </p>
          </li>
          <li className="bg-[var(--pipeline-surface)] px-4 py-3">
            <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
              Ainda abertos
            </p>
            <p className="mt-0.5 font-display text-[18px] font-bold tabular-nums text-[var(--pipeline-text)]">
              {formatCount(cohort.open)}
            </p>
          </li>
          <li className="bg-[var(--pipeline-surface)] px-4 py-3">
            <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
              Já ganhos
            </p>
            <p className="mt-0.5 font-display text-[18px] font-bold tabular-nums text-[var(--pipeline-success)]">
              {formatCount(cohort.won)}
            </p>
          </li>
          <li className="bg-[var(--pipeline-surface)] px-4 py-3">
            <p className="font-body text-[11px] text-[var(--pipeline-text-muted)]">
              Já perdidos
            </p>
            <p className="mt-0.5 font-display text-[18px] font-bold tabular-nums text-[var(--pipeline-danger)]">
              {formatCount(cohort.lost)}
            </p>
          </li>
        </ul>
      ) : null}
      </div>
      </div>
    </section>
  );
}
