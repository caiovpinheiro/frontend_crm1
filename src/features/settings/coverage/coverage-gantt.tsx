"use client";

import * as React from "react";
import { IconPencil } from "@tabler/icons-react";

import { UserAvatar } from "@/components/crm/user-avatar";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import { cn } from "@/lib/utils";

import {
  daySummary,
  fmtHour,
  fmtHourShort,
  pct,
  shiftHours,
  type CoverageAgent,
  type HourCoverage,
  type ShiftHours,
} from "./schedule-data";

export const AGENT_COL = "15rem";
/** Checkbox à esquerda da foto — sai no scroll horizontal. */
const CHECK_COL = "2.75rem";
/** Só a foto permanece fixa ao arrastar o horário. */
const PHOTO_COL = "2.75rem";
const NAME_COL = `calc(${AGENT_COL} - ${CHECK_COL} - ${PHOTO_COL})`;
const HOUR_MIN = "2.25rem";

function coverageCellTip(hour: number, work: number, lunch: number): string {
  const h = fmtHourShort(hour);
  if (work === 0) return `Gap — nenhum agente em expediente às ${h}`;
  if (work === 1) return `Cobertura baixa — só 1 agente em expediente às ${h}${lunch ? ` · ${lunch} em almoço` : ""}`;
  return `${h} — ${work} em expediente${lunch ? ` · ${lunch} em almoço` : ""}`;
}

function CoverageSummaryRow({
  hours,
  perHour,
  hourGrid,
}: {
  hours: number[];
  perHour: HourCoverage[];
  hourGrid: React.CSSProperties;
}) {
  const byHour = new Map(perHour.map((s) => [s.hour, s]));

  return (
    <div
      role="row"
      aria-label="Resumo de cobertura por hora"
      className="flex items-stretch border-y-2 border-[var(--brand-primary)]/35 bg-[color-mix(in_srgb,var(--brand-primary)_10%,var(--glass-bg-base))]"
    >
      <div className="shrink-0" style={{ width: CHECK_COL }} />
      <div
        className="sticky left-0 z-30 shrink-0 self-stretch bg-[color-mix(in_srgb,var(--brand-primary)_10%,var(--glass-bg-base))]"
        style={{ width: PHOTO_COL }}
      />
      <div
        className="flex min-w-0 shrink-0 flex-col justify-center py-2 pr-3"
        style={{ width: NAME_COL }}
      >
          <span className="truncate font-display text-[13px] font-extrabold uppercase tracking-[0.08em] text-[var(--text-primary)]">
            Cobertura
          </span>
          <span className="truncate font-body text-[10px] font-medium text-[var(--text-muted)]">
            agentes em expediente
          </span>
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="grid h-full min-h-[3.25rem]" style={hourGrid}>
          {hours.map((hour) => {
            const slot = byHour.get(hour);
            const work = slot?.work ?? 0;
            const lunch = slot?.lunch ?? 0;
            const empty = work === 0;
            const thin = work === 1;
            return (
              <TooltipGlass
                key={hour}
                label={coverageCellTip(hour, work, lunch)}
                side="top"
              >
                <div
                  className={cn(
                    "flex h-full min-h-[3.25rem] cursor-default items-center justify-center border-l border-[var(--glass-border)]/40 font-display text-[15px] font-extrabold tabular-nums",
                    empty &&
                      "bg-[color-mix(in_srgb,var(--color-danger)_78%,transparent)] text-white",
                    thin &&
                      "bg-[color-mix(in_srgb,var(--color-warn)_62%,transparent)] text-[color-mix(in_srgb,var(--color-warn)_75%,black)]",
                    !empty &&
                      !thin &&
                      "bg-[color-mix(in_srgb,var(--color-success)_22%,transparent)] text-[var(--color-success)]",
                  )}
                >
                  {work}
                </div>
              </TooltipGlass>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AgentBar({
  shift,
  dayStart,
  dayEnd,
}: {
  shift: ShiftHours;
  dayStart: number;
  dayEnd: number;
}) {
  const visStart = Math.max(shift.start, dayStart);
  const visEnd = Math.min(shift.end, dayEnd);
  const left = pct(visStart, dayStart, dayEnd);
  const width = pct(visEnd, dayStart, dayEnd) - left;
  if (width <= 0) return null;

  const visSpan = visEnd - visStart;
  let lunch: { left: number; width: number } | null = null;
  if (shift.lunchStart != null && shift.lunchEnd != null && visSpan > 0) {
    const ls = Math.max(shift.lunchStart, visStart);
    const le = Math.min(shift.lunchEnd, visEnd);
    if (le > ls) {
      lunch = {
        left: ((ls - visStart) / visSpan) * 100,
        width: ((le - ls) / visSpan) * 100,
      };
    }
  }

  return (
    <div
      className="absolute inset-y-1.5"
      style={{ left: `${left}%`, width: `${width}%` }}
    >
      <TooltipGlass
        label={`Expediente ${fmtHour(shift.start)}–${fmtHour(shift.end)}`}
        side="top"
      >
        <div className="absolute inset-0 rounded bg-[var(--color-success)] transition-[filter] hover:brightness-105" />
      </TooltipGlass>
      {lunch && (
        <TooltipGlass
          label={`Almoço ${fmtHour(shift.lunchStart!)}–${fmtHour(shift.lunchEnd!)}`}
          side="top"
        >
          <div
            className="absolute inset-y-0 bg-[var(--color-warn)]"
            style={{ left: `${lunch.left}%`, width: `${lunch.width}%` }}
          />
        </TooltipGlass>
      )}
    </div>
  );
}

export function CoverageGantt({
  agents,
  weekday,
  perHour,
  maxCoverage,
  dayStart,
  dayEnd,
  hours,
  nowMinutes,
  isToday,
  selected,
  allSelected,
  onToggleAll,
  onToggle,
  onEdit,
}: {
  agents: CoverageAgent[];
  weekday: number;
  perHour: HourCoverage[];
  maxCoverage: number;
  dayStart: number;
  dayEnd: number;
  hours: number[];
  nowMinutes: number;
  isToday: boolean;
  selected: Set<string>;
  allSelected: boolean;
  onToggleAll: () => void;
  onToggle: (id: string) => void;
  onEdit: (agent: CoverageAgent) => void;
}) {
  const span = hours.length;
  const nowHours = nowMinutes / 60;
  const nowPct =
    isToday && nowHours >= dayStart && nowHours <= dayEnd
      ? pct(nowHours, dayStart, dayEnd)
      : null;
  const hourGrid = { gridTemplateColumns: `repeat(${span}, minmax(${HOUR_MIN}, 1fr))` };
  const minWidth = `calc(${AGENT_COL} + ${span} * ${HOUR_MIN})`;
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const pinRef = React.useRef<HTMLDivElement>(null);
  const lineRef = React.useRef<HTMLDivElement>(null);
  const [nowHidden, setNowHidden] = React.useState(false);

  const syncNowLine = React.useCallback(() => {
    const line = lineRef.current;
    const pin = pinRef.current;
    if (!line || !pin) {
      setNowHidden(false);
      return;
    }
    const hide = line.getBoundingClientRect().left <= pin.getBoundingClientRect().right + 0.5;
    setNowHidden((prev) => (prev === hide ? prev : hide));
  }, []);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    syncNowLine();
    el.addEventListener("scroll", syncNowLine, { passive: true });
    const ro = new ResizeObserver(syncNowLine);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncNowLine);
      ro.disconnect();
    };
  }, [syncNowLine, nowPct, agents.length, hours.length]);

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-bg-base)] shadow-[var(--glass-shadow-sm)]">
      <div ref={scrollerRef} className="overflow-x-auto">
        <div className="relative min-w-full" style={{ minWidth }}>
          {/* Régua: mini-gráfico de cobertura por hora */}
          <div className="flex border-b border-[var(--glass-border)]">
            <div
              className="flex shrink-0 items-center bg-[var(--glass-bg-base)] pl-3"
              style={{ width: CHECK_COL }}
            >
              <CheckboxGlass
                checked={allSelected}
                onChange={onToggleAll}
                aria-label="Selecionar todos os agentes filtrados"
              />
            </div>
            <div
              ref={pinRef}
              className="sticky left-0 z-30 shrink-0 self-stretch bg-[var(--glass-bg-base)]"
              style={{ width: PHOTO_COL }}
            />
            <div
              className="flex min-w-0 shrink-0 items-center bg-[var(--glass-bg-base)] pr-3"
              style={{ width: NAME_COL }}
            >
              <span className="truncate font-display text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Agente
              </span>
            </div>
            <div className="relative min-w-0 flex-1">
              <div className="grid" style={hourGrid}>
                {perHour.map(({ hour, work }) => {
                  const zero = work === 0;
                  const h = Math.max((work / maxCoverage) * 100, zero ? 0 : 8);
                  return (
                    <TooltipGlass
                      key={hour}
                      label={
                        zero
                          ? `Gap — nenhum agente em expediente às ${fmtHourShort(hour)}`
                          : `${fmtHourShort(hour)} — ${work} em expediente`
                      }
                      side="top"
                    >
                      <div className="flex flex-col items-center gap-1 border-l border-[var(--glass-border)]/70 px-1 pt-2">
                        <span
                          className={cn(
                            "font-display text-[10px] font-semibold tabular-nums",
                            zero
                              ? "text-[var(--color-danger)]"
                              : "text-[var(--text-secondary)]",
                          )}
                        >
                          {work}
                        </span>
                        <div className="flex h-10 w-full items-end justify-center">
                          <div
                            className={cn(
                              "w-full max-w-4 rounded-t-sm",
                              zero ? "bg-[var(--color-danger)]" : "bg-[var(--brand-primary)]",
                            )}
                            style={{ height: `${Math.max(h, zero ? 6 : 8)}%` }}
                          />
                        </div>
                        <span className="pb-1 font-display text-[10px] font-medium tabular-nums text-[var(--text-muted)]">
                          {fmtHourShort(hour)}
                        </span>
                      </div>
                    </TooltipGlass>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="relative">
            {nowPct !== null && (
              <div
                ref={lineRef}
                className={
                  nowHidden
                    ? "pointer-events-none invisible absolute inset-y-0 z-20 w-px bg-[var(--color-danger)]"
                    : "pointer-events-none absolute inset-y-0 z-20 w-px bg-[var(--color-danger)]"
                }
                style={{
                  left: `calc(${AGENT_COL} + (100% - ${AGENT_COL}) * ${nowPct / 100})`,
                }}
              >
                <TooltipGlass label="Agora — horário atual" side="right">
                  <span className="pointer-events-auto absolute top-0 left-1/2 -translate-x-1/2 cursor-default rounded-b bg-[var(--color-danger)] px-1.5 py-0.5 font-display text-[10px] font-semibold text-white tabular-nums">
                    {fmtHour(nowHours)}
                  </span>
                </TooltipGlass>
              </div>
            )}

            <CoverageSummaryRow hours={hours} perHour={perHour} hourGrid={hourGrid} />

            {agents.map((agent, i) => {
              const presence = agent.agentStatus?.status ?? "OFFLINE";
              const inactive = agent.participates === false;
              const shift = inactive ? null : shiftHours(agent.schedule, weekday);
              const odd = i % 2 === 1;
              return (
                <div
                  key={agent.id}
                  className={cn(
                    "group flex items-stretch border-b border-[var(--glass-border)] last:border-0 hover:bg-[var(--glass-bg-panel)]",
                    odd && "bg-[var(--glass-bg-panel)]/40",
                  )}
                >
                  <div
                    className={cn(
                      "flex shrink-0 items-center pl-3 group-hover:bg-[var(--glass-bg-panel)]",
                      odd
                        ? "bg-[color-mix(in_srgb,var(--glass-bg-panel)_40%,var(--glass-bg-base))]"
                        : "bg-[var(--glass-bg-base)]",
                    )}
                    style={{ width: CHECK_COL }}
                  >
                      <CheckboxGlass
                        checked={selected.has(agent.id)}
                        onChange={() => onToggle(agent.id)}
                        aria-label={`Selecionar ${agent.name}`}
                      />
                    </div>
                    <div
                      className={cn(
                        "sticky left-0 z-30 flex shrink-0 items-center justify-center self-stretch group-hover:bg-[var(--glass-bg-panel)]",
                        odd
                          ? "bg-[color-mix(in_srgb,var(--glass-bg-panel)_40%,var(--glass-bg-base))]"
                          : "bg-[var(--glass-bg-base)]",
                      )}
                      style={{ width: PHOTO_COL }}
                    >
                      <UserAvatar
                        size={28}
                        name={agent.name}
                        imageUrl={agent.avatarUrl}
                        status={
                          presence === "ONLINE"
                            ? "online"
                            : presence === "AWAY"
                              ? "away"
                              : "offline"
                        }
                      />
                    </div>
                    <div
                      className={cn(
                        "flex min-w-0 shrink-0 items-center gap-2 py-2 pr-3 group-hover:bg-[var(--glass-bg-panel)]",
                        odd
                          ? "bg-[color-mix(in_srgb,var(--glass-bg-panel)_40%,var(--glass-bg-base))]"
                          : "bg-[var(--glass-bg-base)]",
                      )}
                      style={{ width: NAME_COL }}
                    >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p
                          className={cn(
                            "truncate font-display text-[13px] font-semibold",
                            inactive ? "text-[var(--text-muted)]" : "text-[var(--text-primary)]",
                          )}
                        >
                          {agent.name}
                        </p>
                        {agent.visibleInCoverage === false ? (
                          <TooltipGlass
                            label="Escondido da lista — clique em editar para voltar a aparecer"
                            side="left"
                          >
                            <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--text-muted)_18%,transparent)] px-1.5 py-0.5 font-display text-[9px] font-bold uppercase text-[var(--text-muted)]">
                              Oculto
                            </span>
                          </TooltipGlass>
                        ) : null}
                      </div>
                      <p className="truncate font-body text-[11px] tabular-nums text-[var(--text-muted)]">
                        {inactive
                          ? "Não participa"
                          : shift
                            ? `${fmtHour(shift.start)}–${fmtHour(shift.end)}`
                            : daySummary(agent.schedule, weekday)}
                      </p>
                    </div>
                    <TooltipGlass label="Editar horário" side="left">
                      <button
                        type="button"
                        onClick={() => onEdit(agent)}
                        aria-label={`Editar horário de ${agent.name}`}
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--brand-primary)] transition-opacity hover:bg-[var(--color-primary-soft)]",
                          agent.visibleInCoverage === false
                            ? "opacity-100"
                            : "opacity-0 group-hover:opacity-100",
                        )}
                      >
                        <IconPencil size={13} />
                      </button>
                    </TooltipGlass>
                  </div>

                  <div className="relative min-w-0 flex-1">
                    <div className="absolute inset-0 grid" style={hourGrid}>
                      {hours.map((h) => (
                        <div
                          key={h}
                          className="border-l border-[var(--glass-border)]/50"
                        />
                      ))}
                    </div>
                    {inactive ? (
                      <TooltipGlass
                        label="Não participa da distribuição — não recebe leads"
                        side="top"
                      >
                        <div className="absolute inset-y-1.5 right-0 left-0 flex cursor-default items-center rounded bg-[var(--glass-bg-strong)]">
                          <span className="pl-3 font-display text-[11px] font-medium text-[var(--text-muted)]">
                            Não participa
                          </span>
                        </div>
                      </TooltipGlass>
                    ) : shift ? (
                      <AgentBar shift={shift} dayStart={dayStart} dayEnd={dayEnd} />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
