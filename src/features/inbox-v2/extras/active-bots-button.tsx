"use client";

/*
 * ActiveBotsButton — ícone ao lado da composer (inbox e deal).
 * Card Compacta Pro: accordion denso com fluxo, métricas e histórico.
 * Ações: adicionar (picker), interromper, reexecutar e editar.
 * Vínculo por contato; SSE `automation_state` invalida a lista.
 */

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Bot,
  ChevronDown,
  Pause,
  Pencil,
  Play,
  Plus,
} from "lucide-react";
import { IconRobot } from "@tabler/icons-react";

import { useIdleEnabled } from "@/hooks/use-idle-enabled";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import {
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
import { StatusDot } from "./automation-status-dot";
import {
  blockColorToTone,
  rowStatusToRunStatus,
  toneClasses,
  type AutomationHistoryItem,
} from "./automations-data";

const POPOVER_W = 448;
const POPOVER_GAP = 8;
const POPOVER_MARGIN = 8;
const FLOW_VISIBLE_MAX = 8;

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

function historyToItems(history: AutomationHistoryDto[]): AutomationHistoryItem[] {
  return history.slice(0, 5).map((h) => ({
    id: h.contextId,
    date: formatWhen(h.finishedAt),
    duration: formatDuration(h.startedAt, h.finishedAt),
    status: rowStatusToRunStatus(h.status),
  }));
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
      <span className="pointer-events-none absolute -bottom-0.5 -right-0.5 z-10 grid min-h-3.5 min-w-3.5 place-items-center rounded-full bg-violet-600 px-0.5 text-[9px] font-bold leading-none tabular-nums text-primary-foreground ring-2 ring-(--glass-bg-strong)">
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
              className="z-(--z-popover) flex w-full max-w-md flex-col overflow-hidden rounded-xl bg-card text-foreground shadow-xl ring-1 ring-border"
            >
              <div className="flex shrink-0 items-center justify-between bg-slate-900 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-2">
                  <Bot className="size-4 shrink-0 text-slate-300" aria-hidden />
                  <h2 className="truncate text-sm font-semibold text-slate-50">
                    Automações
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={openPicker}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <Plus className="size-3.5" aria-hidden />
                  Adicionar
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
                {(isLoading || (open && loadingHistory && rows.length === 0)) && (
                  <p className="px-5 py-4 text-xs text-muted-foreground">
                    Carregando…
                  </p>
                )}

                {!isLoading && rows.length === 0 && !loadingHistory && (
                  <div className="flex flex-col items-center px-5 py-7 text-center">
                    <p className="text-sm font-semibold text-foreground">
                      Nenhuma automação neste contato
                    </p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      Dispare um fluxo para acompanhar passos, execuções e histórico aqui.
                    </p>
                    <button
                      type="button"
                      onClick={openPicker}
                      className="mt-3 inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                    >
                      <Plus className="size-3.5" aria-hidden />
                      Adicionar
                    </button>
                  </div>
                )}

                {rows.length > 0 && (
                  <ul className="divide-y divide-border">
                    {rows.map((row) => (
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
                  <p className="px-5 py-2 text-xs text-amber-600">
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
  cancelPending,
  runningReplay,
  onPause,
  onPlay,
}: {
  row: PanelRow;
  history: AutomationHistoryDto[];
  expanded: boolean;
  onToggle: () => void;
  cancelPending: boolean;
  runningReplay: boolean;
  onPause: () => void;
  onPlay: () => void;
}) {
  const panelId = useId();
  const isLive = row.status === "RUNNING" || row.status === "PAUSED";
  const runStatus = rowStatusToRunStatus(row.status);

  return (
    <li>
      <div className="flex items-center gap-3 px-5 py-3">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              !expanded && "-rotate-90",
            )}
            aria-hidden
          />
          <span className="sr-only">
            {expanded ? "Recolher" : "Expandir"} {row.name}
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-foreground">
            {row.name}
          </span>
          <StatusDot status={runStatus} />
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {isLive ? (
            <button
              type="button"
              disabled={cancelPending}
              onClick={onPause}
              title="Interromper automação"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-amber-500 text-white transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Pause className="size-3 fill-current" aria-hidden />
              <span className="sr-only">Interromper {row.name}</span>
            </button>
          ) : (
            <button
              type="button"
              disabled={runningReplay}
              onClick={onPlay}
              title="Executar novamente"
              className="flex size-7 cursor-pointer items-center justify-center rounded-md bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Play className="size-3 translate-x-px fill-current" aria-hidden />
              <span className="sr-only">Executar {row.name}</span>
            </button>
          )}
          <Link
            href={`/automations/${row.automationId}`}
            title="Editar automação"
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted"
          >
            <Pencil className="size-3.5" aria-hidden />
            <span className="sr-only">Editar {row.name}</span>
          </Link>
        </div>
      </div>

      {expanded && (
        <ExpandedBody
          panelId={panelId}
          automationId={row.automationId}
          history={history}
          stepLabel={row.stepLabel}
          live={isLive}
        />
      )}
    </li>
  );
}

function ExpandedBody({
  panelId,
  automationId,
  history,
  stepLabel,
  live,
}: {
  panelId: string;
  automationId: string;
  history: AutomationHistoryDto[];
  stepLabel: string | null;
  live: boolean;
}) {
  const { data, isLoading } = useAutomation(automationId);
  const { data: stats } = useAutomationStats(automationId, true);
  const steps = useMemo(() => {
    const types = data?.steps?.map((s) => s.type) ?? data?.stepTypes ?? [];
    return types.map((t) => {
      const key = blockKeyForStepType(t);
      const meta = getBlockMeta(key);
      return {
        key,
        label: meta.label,
        tone: blockColorToTone(meta.color),
        Icon: meta.Icon,
      };
    });
  }, [data]);
  const activeIndex = live
    ? findActiveStepIndex(steps.map((s) => s.key), stepLabel)
    : -1;
  const metrics = useMemo(
    () => buildPanelMetrics(steps.length || data?.stepCount, history, stats),
    [data?.stepCount, history, stats, steps.length],
  );
  const historyItems = useMemo(() => historyToItems(history), [history]);

  return (
    <div id={panelId} className="space-y-4 px-5 py-4">
      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Fluxo
        </p>
        {isLoading ? (
          <p className="mt-2 text-xs text-muted-foreground">Carregando fluxo…</p>
        ) : steps.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">Sem passos definidos.</p>
        ) : (
          <FlowChips steps={steps} activeIndex={activeIndex} />
        )}
      </section>

      <div className="flex items-center gap-4 rounded-lg bg-muted/60 px-4 py-2.5">
        <MetricPair value={metrics.steps} label="passos" />
        <span className="h-4 w-px shrink-0 bg-border" aria-hidden />
        <MetricPair value={metrics.runs} label="execuções" />
        <div className="ml-auto flex items-center gap-2">
          <span
            className="h-1.5 w-12 overflow-hidden rounded-full bg-border"
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-emerald-500"
              style={{
                width: `${metrics.rate == null ? 0 : Math.min(100, metrics.rate)}%`,
              }}
            />
          </span>
          <span className="text-xs font-semibold tabular-nums text-emerald-600">
            {metrics.rate == null ? "—" : `${metrics.rate}%`}
          </span>
        </div>
      </div>

      <section>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Histórico
        </p>
        {historyItems.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Sem execuções anteriores.
          </p>
        ) : (
          <table className="mt-1 w-full">
            <tbody>
              {historyItems.map((item) => (
                <HistoryRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

function MetricPair({
  value,
  label,
}: {
  value: string | number;
  label: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-base font-bold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function HistoryRow({ item }: { item: AutomationHistoryItem }) {
  return (
    <tr className="border-t border-border/60">
      <td className="py-2">
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              item.status === "failed" ? "bg-rose-500" : "bg-emerald-500",
            )}
            aria-hidden
          />
          <span className="text-xs font-medium tabular-nums text-foreground">
            {item.date}
          </span>
          {item.duration ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {item.duration}
            </span>
          ) : null}
        </span>
      </td>
      <td className="py-2 text-right">
        <StatusDot status={item.status} />
      </td>
    </tr>
  );
}

function FlowChips({
  steps,
  activeIndex,
}: {
  steps: Array<{
    key: string;
    label: string;
    tone: keyof typeof toneClasses;
    Icon: ReturnType<typeof getBlockMeta>["Icon"];
  }>;
  activeIndex: number;
}) {
  const overflow = steps.length - FLOW_VISIBLE_MAX;
  const visible = overflow > 0 ? steps.slice(0, FLOW_VISIBLE_MAX) : steps;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {visible.map((step, i) => {
        const Icon = step.Icon;
        const active = i === activeIndex;
        return (
          <span
            key={`${step.key}-${i}`}
            title={step.label}
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              toneClasses[step.tone],
              active && "ring-2 ring-emerald-500/60",
            )}
          >
            <Icon className="size-3.5" size={14} aria-hidden />
            <span className="sr-only">
              Passo {i + 1}: {step.label}
            </span>
          </span>
        );
      })}
      {overflow > 0 && (
        <span
          title={`${overflow} passos a mais`}
          className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular-nums text-muted-foreground"
        >
          +{overflow}
        </span>
      )}
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

