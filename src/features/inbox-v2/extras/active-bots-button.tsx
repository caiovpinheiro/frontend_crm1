"use client";

/*
 * ActiveBotsButton — ícone ao lado da composer (inbox e deal).
 * Abre um card com as automações do contato (ativas + histórico),
 * accordion por item com mini-fluxo, métricas e histórico.
 * Ações: adicionar (picker), interromper, reexecutar e editar.
 * Vínculo por contato; SSE `automation_state` invalida a lista.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useIdleEnabled } from "@/hooks/use-idle-enabled";
import {
  IconRobot,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPencil,
  IconChevronDown,
  IconClock,
  IconPlus,
  IconTrendingUp,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
  blockChipStyle,
  blockKeyForStepType,
  getBlockMeta,
} from "@/components/crm/flow-block-icon";
import {
  useCancelAutomation,
  useContactActiveAutomations,
  useContactAutomationHistory,
  contactActiveAutomationsKey,
  contactAutomationHistoryKey,
} from "@/features/inbox-v2/hooks";
import type {
  ActiveAutomationDto,
  AutomationHistoryDto,
} from "@/features/inbox-v2/api/conversations";
import { useAutomation, useAutomationStats } from "@/features/automations-v2/hooks";
import { usePortalPopover } from "@/features/pipeline-v2/extras/use-portal-popover";
import { AgentAutomationPickerModal } from "./agent-automation-picker-modal";

const POPOVER_W = 448;
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 8;

/**
 * Ancora o card acima do robô (`side="top"`) alinhado à direita do
 * trigger (`align="end"`). Usa `bottom` em vez de altura estimada —
 * o accordion varia e um `top` com 440px fictícios afastava o painel
 * para o alto da tela.
 *
 * `maxHeight` trava no vão real até o topo da viewport: sem isso o
 * accordion (fluxo + métricas + histórico) estoura e o card corta.
 */
function computeAboveEndPosition(
  rect: DOMRect | null,
  popoverWidth: number,
): { bottom: number; left: number; width: number; maxHeight: number } {
  if (!rect) {
    return { bottom: 0, left: 0, width: popoverWidth, maxHeight: 420 };
  }
  const viewportW = typeof window !== "undefined" ? window.innerWidth : 1200;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 800;
  const width = Math.min(
    popoverWidth,
    Math.max(280, viewportW - POPOVER_MARGIN * 2),
  );

  const bottom = Math.max(POPOVER_MARGIN, viewportH - rect.top + POPOVER_GAP);
  const maxHeight = Math.max(220, rect.top - POPOVER_GAP - POPOVER_MARGIN);
  let left = rect.right - width;
  left = Math.max(
    POPOVER_MARGIN,
    Math.min(left, viewportW - width - POPOVER_MARGIN),
  );
  return { bottom, left, width, maxHeight };
}

type RowStatus = "RUNNING" | "PAUSED" | "COMPLETED" | "TIMED_OUT";

type PanelRow = {
  key: string;
  automationId: string;
  name: string;
  status: RowStatus;
  contextId: string | null;
  stepLabel: string | null;
};

interface ActiveBotsButtonProps {
  contactId: string | null;
  conversationId?: string | null;
  /**
   * `inline` = botão na barra do composer (ao lado do enviar).
   * Sem `inline` = overlay absoluto (uso legado).
   */
  inline?: boolean;
  className?: string;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm} ${hh}:${mi}`;
}

function formatDuration(startIso: string, endIso: string): string {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return "";
  const totalSec = Math.round((end - start) / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  if (totalMin < 60) {
    const sec = totalSec % 60;
    return sec ? `${totalMin}min ${sec}s` : `${totalMin}min`;
  }
  const hours = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hours}h ${min}min` : `${hours}h`;
}

function badgeFor(status: RowStatus): { label: string; className: string; dot?: boolean } {
  switch (status) {
    case "RUNNING":
      return {
        label: "Rodando",
        className: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
        dot: true,
      };
    case "PAUSED":
      return {
        label: "Pausada",
        className: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]",
      };
    case "COMPLETED":
      return {
        label: "Concluída",
        className: "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
      };
    case "TIMED_OUT":
      return {
        label: "Falhou",
        className: "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]",
      };
  }
}

function subtextFor(row: PanelRow): string {
  switch (row.status) {
    case "RUNNING":
      return row.stepLabel || "Em execução";
    case "PAUSED":
      return row.stepLabel || "Aguardando";
    case "COMPLETED":
      return "Fluxo concluído";
    case "TIMED_OUT":
      return "Tempo esgotado";
  }
}

function buildRows(
  active: ActiveAutomationDto[],
  history: AutomationHistoryDto[],
): PanelRow[] {
  const activeIds = new Set(active.map((a) => a.automationId));
  const rows: PanelRow[] = active.map((bot) => ({
    key: bot.contextId,
    automationId: bot.automationId,
    name: bot.name,
    status: bot.status,
    contextId: bot.contextId,
    stepLabel: bot.stepLabel,
  }));

  const latestByAuto = new Map<string, AutomationHistoryDto>();
  for (const h of history) {
    if (activeIds.has(h.automationId)) continue;
    const prev = latestByAuto.get(h.automationId);
    if (!prev || h.finishedAt > prev.finishedAt) latestByAuto.set(h.automationId, h);
  }
  for (const h of latestByAuto.values()) {
    rows.push({
      key: h.contextId,
      automationId: h.automationId,
      name: h.name,
      status: h.status,
      contextId: null,
      stepLabel: null,
    });
  }
  return rows;
}

async function runAutomation(
  automationId: string,
  payload: { contactId: string; conversationId?: string | null },
): Promise<{ automationName?: string }> {
  const res = await fetch(apiUrl(`/api/automations/${automationId}/run`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contactId: payload.contactId,
      conversationId: payload.conversationId ?? undefined,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    automationName?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(typeof json?.message === "string" ? json.message : "Falha ao executar");
  }
  return { automationName: json.automationName };
}

export function ActiveBotsButton({
  contactId,
  conversationId = null,
  inline,
  className,
}: ActiveBotsButtonProps) {
  const { open, rect, triggerRef, popoverRef, toggle, close } = usePortalPopover();
  const idle = useIdleEnabled(2000);
  const { data: active = [], isLoading } = useContactActiveAutomations(
    idle || open ? contactId : null,
  );
  const { data: history = [], isLoading: loadingHistory } =
    useContactAutomationHistory(contactId, open);
  const cancel = useCancelAutomation(contactId);
  const qc = useQueryClient();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);

  const rows = useMemo(() => buildRows(active, history), [active, history]);

  useEffect(() => {
    if (!open) {
      setExpandedId(null);
      return;
    }
    setExpandedId((prev) => {
      if (prev && rows.some((r) => r.key === prev)) return prev;
      const running = rows.find((r) => r.status === "RUNNING");
      return running?.key ?? rows[0]?.key ?? null;
    });
  }, [open, rows]);

  const count = active.length;
  const hasActive = count > 0;
  const pos = computeAboveEndPosition(rect, POPOVER_W);

  function openPicker() {
    close();
    setPickerOpen(true);
  }

  async function handleReplay(row: PanelRow) {
    if (!contactId || runningId) return;
    setRunningId(row.automationId);
    try {
      const result = await runAutomation(row.automationId, {
        contactId,
        conversationId,
      });
      toast.success(`Automação disparada: ${result.automationName ?? row.name}`);
      qc.invalidateQueries({ queryKey: contactActiveAutomationsKey(contactId) });
      qc.invalidateQueries({ queryKey: contactAutomationHistoryKey(contactId) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar automação");
    } finally {
      setRunningId(null);
    }
  }

  const button = (
    <button
      ref={triggerRef}
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        toggle();
      }}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={
        hasActive ? `${count} automação(ões) em execução` : "Automações"
      }
      title="Automações"
      className={cn(
        "flex cursor-pointer items-center justify-center rounded-full border transition-all",
        inline
          ? "absolute inset-0"
          : "relative h-10 w-10 shadow-(--glass-shadow-sm) backdrop-blur-md hover:scale-[1.06]",
        hasActive
          ? "border-violet-500/30 bg-violet-500/15 text-violet-600 v2-dark:text-violet-300"
          : "border-(--glass-border) bg-(--glass-bg-overlay) text-(--text-muted) hover:text-(--brand-primary)",
      )}
    >
      <IconRobot
        size={inline ? 24 : 19}
        stroke={1.75}
        className={inline ? "block shrink-0" : undefined}
      />
    </button>
  );

  const badges = hasActive ? (
    <>
      <span className="pointer-events-none absolute -right-0.5 -top-0.5 z-10 flex h-1.5 w-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-70" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-violet-500" />
      </span>
      <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 grid min-h-3.5 min-w-3.5 place-items-center rounded-full bg-violet-600 px-0.5 text-[9px] font-bold leading-none text-white ring-2 ring-(--glass-bg-strong)">
        {count}
      </span>
    </>
  ) : null;

  return (
    <div
      className={cn(
        inline
          ? "relative flex size-9 shrink-0 items-center justify-center self-center overflow-visible"
          : "absolute bottom-[4.75rem] right-6 z-20",
        className,
      )}
    >
      {inline ? (
        button
      ) : (
        <TooltipGlass label="Automações" side="top">
          {button}
        </TooltipGlass>
      )}
      {badges}

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              role="dialog"
              aria-label="Automações"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: "fixed",
                bottom: pos.bottom,
                left: pos.left,
                width: pos.width,
                maxHeight: pos.maxHeight,
                isolation: "isolate",
              }}
              className="z-(--z-popover) flex flex-col overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] text-[var(--text-primary)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--glass-border)] px-5 py-4">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-soft)] text-[var(--brand-primary)]">
                    <IconRobot size={18} stroke={2} />
                  </span>
                  <span className="font-display text-base font-semibold tracking-tight">
                    Automações
                  </span>
                  {hasActive && (
                    <span className="rounded-full bg-[var(--color-primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--brand-primary)]">
                      {count} ativa{count === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={openPicker}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-[var(--brand-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
                >
                  <IconPlus size={16} stroke={2.2} />
                  Adicionar
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                {(isLoading || (open && loadingHistory && rows.length === 0)) && (
                  <p className="px-3.5 py-4 text-[12.5px] text-(--text-muted)">
                    Carregando…
                  </p>
                )}

                {!isLoading && rows.length === 0 && !loadingHistory && (
                  <div className="flex flex-col items-center px-5 py-7 text-center">
                    <span className="mb-2.5 flex size-10 items-center justify-center rounded-2xl bg-(--color-primary-soft) text-(--brand-primary)">
                      <IconRobot size={20} stroke={1.8} />
                    </span>
                    <p className="text-[13px] font-semibold text-(--text-primary)">
                      Nenhuma automação neste contato
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-(--text-muted)">
                      Dispare um fluxo para acompanhar passos, execuções e histórico aqui.
                    </p>
                    <button
                      type="button"
                      onClick={openPicker}
                      className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded-full bg-(--brand-primary) px-3 py-1.5 text-[12px] font-semibold text-white shadow-(--glass-shadow-sm) transition-opacity hover:opacity-90"
                    >
                      <IconPlus size={13} stroke={2.4} />
                      Adicionar
                    </button>
                  </div>
                )}

                {rows.length > 0 && (
                  <ul>
                    {rows.map((row, i) => (
                      <AutomationRow
                        key={row.key}
                        row={row}
                        history={history.filter(
                          (h) => h.automationId === row.automationId,
                        )}
                        expanded={expandedId === row.key}
                        onToggle={() =>
                          setExpandedId((id) => (id === row.key ? null : row.key))
                        }
                        showDivider={i < rows.length - 1}
                        cancelPending={cancel.isPending}
                        runningReplay={runningId === row.automationId}
                        onPause={() => {
                          if (row.contextId) cancel.mutate(row.contextId);
                        }}
                        onPlay={() => void handleReplay(row)}
                      />
                    ))}
                  </ul>
                )}

                {cancel.isError && (
                  <p className="px-3.5 py-2 text-[11px] text-(--color-warning)">
                    {cancel.error?.message ?? "Erro ao interromper a automação."}
                  </p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      <AgentAutomationPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        conversationId={conversationId}
        contactId={contactId}
      />
    </div>
  );
}

function AutomationRow({
  row,
  history,
  expanded,
  onToggle,
  showDivider,
  cancelPending,
  runningReplay,
  onPause,
  onPlay,
}: {
  row: PanelRow;
  history: AutomationHistoryDto[];
  expanded: boolean;
  onToggle: () => void;
  showDivider: boolean;
  cancelPending: boolean;
  runningReplay: boolean;
  onPause: () => void;
  onPlay: () => void;
}) {
  const badge = badgeFor(row.status);
  const isLive = row.status === "RUNNING" || row.status === "PAUSED";
  const running = row.status === "RUNNING";

  return (
    <li className={cn(showDivider && "border-b border-[var(--glass-border)]")}>
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="group flex min-w-0 flex-1 items-start gap-2 text-left"
          >
            <IconChevronDown
              size={16}
              stroke={2.2}
              className={cn(
                "mt-0.5 shrink-0 text-[var(--text-muted)] transition-transform",
                expanded ? "rotate-0" : "-rotate-90",
              )}
              aria-hidden
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-2">
                <span className="truncate font-semibold text-[var(--text-primary)]">
                  {row.name}
                </span>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                    badge.className,
                  )}
                >
                  <span className="relative flex size-1.5">
                    {running && (
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-75" />
                    )}
                    <span
                      className={cn(
                        "relative inline-flex size-1.5 rounded-full",
                        running
                          ? "bg-[var(--color-success)]"
                          : row.status === "PAUSED"
                            ? "bg-[var(--color-warning)]"
                            : row.status === "TIMED_OUT"
                              ? "bg-[var(--color-danger)]"
                              : "bg-[var(--text-muted)]",
                      )}
                    />
                  </span>
                  {badge.label}
                </span>
              </span>
              <span className="mt-0.5 block truncate text-sm text-[var(--text-muted)]">
                {subtextFor(row)}
              </span>
            </span>
          </button>

          <div className="flex shrink-0 items-center gap-1">
            {isLive ? (
              <TooltipGlass label="Interromper automação" side="top">
                <button
                  type="button"
                  disabled={cancelPending}
                  onClick={onPause}
                  aria-label={`Interromper ${row.name}`}
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-warning-soft)] text-[var(--color-warning)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconPlayerPauseFilled size={16} />
                </button>
              </TooltipGlass>
            ) : (
              <TooltipGlass label="Executar novamente" side="top">
                <button
                  type="button"
                  disabled={runningReplay}
                  onClick={onPlay}
                  aria-label={`Executar ${row.name}`}
                  className="flex size-9 cursor-pointer items-center justify-center rounded-full bg-[var(--color-success-bg)] text-[var(--color-success-text)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <IconPlayerPlayFilled size={16} />
                </button>
              </TooltipGlass>
            )}
            <TooltipGlass label="Editar automação" side="top">
              <Link
                href={`/automations/${row.automationId}`}
                aria-label={`Editar ${row.name}`}
                className="flex size-9 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              >
                <IconPencil size={16} stroke={1.8} />
              </Link>
            </TooltipGlass>
          </div>
        </div>

        {expanded && (
          <ExpandedBody
            automationId={row.automationId}
            history={history}
            stepLabel={row.stepLabel}
            live={isLive}
          />
        )}
      </div>
    </li>
  );
}

function ExpandedBody({
  automationId,
  history,
  stepLabel,
  live,
}: {
  automationId: string;
  history: AutomationHistoryDto[];
  stepLabel: string | null;
  live: boolean;
}) {
  const { data, isLoading } = useAutomation(automationId);
  const { data: stats } = useAutomationStats(automationId, true);
  const stepTypes = useMemo(() => {
    const types = data?.steps?.map((s) => s.type) ?? data?.stepTypes ?? [];
    return types.map((t) => blockKeyForStepType(t));
  }, [data]);
  const activeIndex = live ? findActiveStepIndex(stepTypes, stepLabel) : -1;
  const metrics = useMemo(
    () => buildPanelMetrics(stepTypes.length || data?.stepCount, history, stats),
    [data?.stepCount, history, stats, stepTypes.length],
  );

  return (
    <div className="mt-4 space-y-5">
      <section>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Fluxo
        </p>
        {isLoading ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Carregando fluxo…</p>
        ) : stepTypes.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Sem passos definidos.</p>
        ) : (
          <div className="mt-3 overflow-x-auto pt-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FlowStrip stepTypes={stepTypes} activeIndex={activeIndex} />
          </div>
        )}
      </section>

      <div className="flex items-center gap-4 rounded-xl bg-[var(--glass-bg-overlay)] px-4 py-3">
        <MetricCell value={metrics.steps} label="Passos" />
        <span className="h-8 w-px shrink-0 bg-[var(--glass-border)]" aria-hidden />
        <MetricCell value={metrics.runs} label="Execuções" />
        <span className="h-8 w-px shrink-0 bg-[var(--glass-border)]" aria-hidden />
        <MetricCell
          value={metrics.rate == null ? "—" : `${metrics.rate}%`}
          label="Taxa de sucesso"
          icon={
            metrics.rate != null && metrics.rate >= 70 ? (
              <IconTrendingUp size={14} className="text-[var(--color-success)]" />
            ) : undefined
          }
        />
      </div>

      <section>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Histórico
        </p>
        {history.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--text-muted)]">Sem execuções anteriores.</p>
        ) : (
          <ol className="relative ml-1 mt-3 border-l border-[var(--glass-border)]">
            {history.slice(0, 5).map((h) => {
              const failed = h.status === "TIMED_OUT";
              const duration = formatDuration(h.startedAt, h.finishedAt);
              return (
                <li
                  key={h.contextId}
                  className="relative flex items-center justify-between gap-3 rounded-md py-2 pl-5 pr-2 transition-colors hover:bg-[var(--glass-bg-overlay)]"
                >
                  <span
                    className={cn(
                      "absolute -left-[5px] top-1/2 size-2.5 -translate-y-1/2 rounded-full ring-2 ring-[var(--glass-bg-modal)]",
                      failed ? "bg-[var(--color-danger)]" : "bg-[var(--color-success)]",
                    )}
                    aria-hidden
                  />
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {formatWhen(h.finishedAt)}
                    </span>
                    {duration && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <IconClock size={14} stroke={1.75} />
                        {duration}
                      </span>
                    )}
                  </div>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                      failed
                        ? "bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
                        : "bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
                    )}
                  >
                    {failed ? "Falhou" : "Concluída"}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function MetricCell({
  value,
  label,
  icon,
  className,
}: {
  value: string | number;
  label: string;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="inline-flex items-center gap-1 text-sm font-semibold tabular-nums text-[var(--text-primary)]">
        {icon}
        {value}
      </span>
      <span className="text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </span>
    </div>
  );
}

function buildPanelMetrics(
  stepCount: number | undefined,
  history: AutomationHistoryDto[],
  stats: { trigger?: Record<string, number> } | undefined,
) {
  const steps = stepCount && stepCount > 0 ? stepCount : "—";
  const t = stats?.trigger ?? {};
  const completed = t.COMPLETED ?? 0;
  const failed =
    (t.FAILED ?? 0) + (t.TIMED_OUT ?? 0) + (t.COMPLETED_WITH_ERRORS ?? 0);
  const started = t.STARTED ?? 0;
  const fromStats = completed + failed + started;
  const runs = fromStats > 0 ? fromStats : history.length;
  const ok = fromStats > 0 ? completed : history.filter((h) => h.status === "COMPLETED").length;
  const rate = runs > 0 ? Math.round((ok / runs) * 100) : null;
  return { steps, runs, rate };
}

function findActiveStepIndex(stepTypes: string[], stepLabel: string | null): number {
  if (!stepLabel) return -1;
  const needle = normalizeLabel(stepLabel);
  if (!needle) return -1;
  const exact = stepTypes.findIndex((t) => normalizeLabel(getBlockMeta(t).label) === needle);
  if (exact >= 0) return exact;
  return stepTypes.findIndex((t) => {
    const label = normalizeLabel(getBlockMeta(t).label);
    return label.length >= 5 && (needle.includes(label) || label.includes(needle));
  });
}

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Faixa circular de ícones do fluxo (definição da automação). */
function FlowStrip({
  stepTypes,
  activeIndex,
}: {
  stepTypes: string[];
  activeIndex: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflow = stepTypes.length - 8;
  const visible = expanded || overflow <= 0 ? stepTypes : stepTypes.slice(0, 8);
  return (
    <div className="flex flex-wrap items-center gap-y-3">
      {visible.map((type, i) => {
        const meta = getBlockMeta(type);
        const Icon = meta.Icon;
        const active = i === activeIndex;
        return (
          <div key={`${type}-${i}`} className="flex items-center">
            <TooltipGlass label={meta.label} side="top">
              <button
                type="button"
                className="group relative rounded-full outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                aria-label={`Passo ${i + 1}: ${meta.label}`}
              >
                <span
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset ring-[var(--glass-border)]",
                    active && "ring-2 ring-[var(--brand-primary)]",
                  )}
                  style={blockChipStyle(type)}
                >
                  <Icon size={18} stroke={2} />
                </span>
                <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--glass-bg-modal)] text-[10px] font-semibold text-[var(--text-muted)] ring-1 ring-[var(--glass-border)]">
                  {i + 1}
                </span>
              </button>
            </TooltipGlass>
            {i < visible.length - 1 && (
              <span className="mx-1 h-px w-4 shrink-0 bg-[var(--glass-border)]" aria-hidden />
            )}
          </div>
        );
      })}
      {overflow > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 flex h-10 items-center justify-center rounded-full border border-dashed border-[var(--glass-border)] px-3 text-sm font-medium text-[var(--text-muted)] transition-colors hover:border-[var(--brand-primary)]/40 hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]"
        >
          {expanded ? "Recolher" : `+${overflow}`}
        </button>
      )}
    </div>
  );
}
