"use client";

/*
 * Aba Atendimentos › Equipe:
 *  - Mapa de calor departamento × hora (azul = conversas)
 *  - Ranking de atendimento (azul = conversas) e Ranking de TMA (violeta = tempo)
 *
 * Todos respeitam período + filtros de Departamento e Usuário da aba.
 * Transferências (turquesa) ficam em `painel-transfers.tsx`.
 */

import { useMemo, useState } from "react";

import {
  PainelBlockError,
  PainelCard,
  PainelEmpty,
  PainelSkeleton,
} from "@/components/crm/dashboard/painel-block";
import { TipScope, tipText } from "@/components/crm/dashboard/chart-tip";
import { LegendSwatch, RankBarList } from "@/components/crm/dashboard/rank-bar-list";
import { SegmentedToggle } from "@/components/crm/dashboard/segmented-toggle";
import {
  formatDurationMs,
  formatNumber,
  textMatchesQuery,
} from "@/features/dashboard-v2/format";
import { clockLabel, type DashboardClock } from "@/features/dashboard-v2/clock-label";
import { MEASURE_COLOR, heatFill } from "@/features/dashboard-v2/measure-colors";
import type {
  PainelBlock,
  PainelDeptHour,
  PainelTeamRankRow,
  PainelTeamRanking,
} from "@/features/dashboard-v2/painel-api";
import {
  HEAT_BINS,
  MIN_SERVICE_SAMPLE,
  attendedParts,
  axisDurationLabel,
  axisMaxMs,
  deltaFromTeam,
  durationAxis,
  heatBin,
  heatBinRanges,
  heatIntensity,
  hourRangeLabel,
  peakHour,
  peakOfTotals,
  rankByAttended,
  rankByServiceTime,
  serviceRankingState,
  shareLabel,
  teamMeanMs,
  teamSubtitle,
} from "@/features/dashboard-v2/team-rankings";
import { cn } from "@/lib/utils";

export type TeamWidgetId = "deptHour" | "teamRankings" | "transfers";

export const TEAM_WIDGET_IDS: readonly TeamWidgetId[] = ["deptHour", "teamRankings", "transfers"];

export function isTeamWidgetId(id: string): id is TeamWidgetId {
  return (TEAM_WIDGET_IDS as readonly string[]).includes(id);
}

/** Bloco ainda não chegou (ou o backend o omitiu nesta chamada). */
export function teamBlockPending<T>(block: PainelBlock<T> | undefined): boolean {
  return !block || (block.ok === false && block.error === "omitido");
}

const TOP_N = 10;
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const hh = (h: number) => `${String(h).padStart(2, "0")}h`;

// ---------------------------------------------------------------------------
// 1. Mapa de calor departamento × hora

const HEAT_GRID_COLUMNS = "minmax(96px,118px) repeat(24,minmax(0,1fr)) minmax(80px,96px)";

type HeatScale = "global" | "row";

export function DeptHourHeatmapWidget({
  block,
  search,
  filtered,
  notice,
  onRetry,
}: {
  block: PainelBlock<PainelDeptHour> | undefined;
  search: string;
  filtered: boolean;
  /** Aviso de período cortado pelo backend (90 dias). */
  notice?: string | null;
  onRetry: () => void;
}) {
  const [scale, setScale] = useState<HeatScale>("global");
  const color = MEASURE_COLOR.conversations;

  if (teamBlockPending(block)) return <PainelSkeleton className="min-h-[220px]" />;
  if (!block!.ok) return <PainelBlockError message={block!.error} onRetry={onRetry} />;

  return (
    <HeatmapCard
      data={block!.data}
      search={search}
      scale={scale}
      onScale={setScale}
      color={color}
      subtitle={teamSubtitle("Conversas iniciadas por hora do dia (Brasília), somando o período", {
        filtered,
        notice,
      })}
    />
  );
}

function HeatmapCard({
  data,
  search,
  scale,
  onScale,
  color,
  subtitle,
}: {
  data: PainelDeptHour;
  search: string;
  scale: HeatScale;
  onScale: (next: HeatScale) => void;
  color: string;
  subtitle: string;
}) {
  const rows = useMemo(
    () => data.rows.filter((r) => textMatchesQuery(r.label, search)),
    [data.rows, search],
  );
  // A margem soma só o que está na grade (a busca por nome reduz as linhas).
  const totals = useMemo(
    () => HOURS.map((h) => rows.reduce((acc, r) => acc + (r.hours[h] ?? 0), 0)),
    [rows],
  );
  const grand = totals.reduce((a, b) => a + b, 0);
  const totalsMax = Math.max(0, ...totals);
  const rowMax = Math.max(0, ...rows.map((r) => r.total));
  const globalMax = Math.max(0, ...rows.flatMap((r) => r.hours));
  const peak = peakOfTotals(totals);
  const ranges = scale === "global" ? heatBinRanges(globalMax) : [];

  return (
    <PainelCard
      title="Mapa de calor por departamento"
      subtitle={subtitle}
      info="'Geral' compara todas as células entre si. 'Por depto.' compara cada hora com o pico do próprio departamento: bom para ver o padrão de equipes pequenas. As barras no topo somam as conversas de cada hora; as da direita, o total de cada departamento."
      wrapAction
      action={
        <SegmentedToggle
          label="Escala de cor"
          value={scale}
          onChange={onScale}
          options={[
            { value: "global", label: "Geral" },
            { value: "row", label: "Por depto." },
          ]}
        />
      }
    >
      {data.empty || rows.length === 0 || grand === 0 ? (
        <PainelEmpty
          embedded
          title="Não há dados no período"
          description="Nenhuma conversa iniciada neste recorte."
        />
      ) : (
        <TipScope>
          <div className="w-full overflow-x-auto pb-1">
            <div
              role="table"
              aria-label="Conversas iniciadas por departamento e hora"
              className="grid min-w-[780px] items-center gap-0.5"
              style={{ gridTemplateColumns: HEAT_GRID_COLUMNS }}
            >
              {/* Total por hora (margem superior) */}
              <div role="row" className="contents">
                <span
                  role="rowheader"
                  className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Total por hora
                </span>
                {totals.map((t, h) => (
                  <div
                    key={h}
                    role="cell"
                    aria-label={`Total, ${hourRangeLabel(h)}: ${t} conversas`}
                    data-tip={tipText(
                      hourRangeLabel(h),
                      `${formatNumber(t)} ${t === 1 ? "conversa" : "conversas"} · ${shareLabel(t, grand)} do período`,
                    )}
                    className="flex h-10 items-end"
                  >
                    <i
                      aria-hidden
                      className={cn(
                        "block min-h-px w-full rounded-t-xs",
                        peak?.hour !== h && "bg-muted-foreground/55",
                      )}
                      style={{
                        height: `${totalsMax > 0 ? (t / totalsMax) * 100 : 0}%`,
                        background: peak?.hour === h ? color : undefined,
                      }}
                    />
                  </div>
                ))}
                <span role="cell" />
              </div>

              {/* Horas */}
              <div role="row" className="contents">
                <span role="columnheader" aria-label="Departamento" />
                {HOURS.map((h) => (
                  <span
                    key={h}
                    role="columnheader"
                    aria-label={hh(h)}
                    className="text-center text-[10px] tabular-nums text-muted-foreground"
                  >
                    {h % 3 === 0 ? hh(h) : "·"}
                  </span>
                ))}
                <span
                  role="columnheader"
                  className="text-right text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  Total
                </span>
              </div>

              {rows.map((row) => {
                const max = scale === "row" ? Math.max(0, ...row.hours) : globalMax;
                const peakH = peakHour(row.hours);
                return (
                  <div key={row.key} role="row" className="contents">
                    <span
                      role="rowheader"
                      className="truncate pr-1.5 text-xs font-semibold text-foreground"
                      title={row.label}
                    >
                      {row.label}
                    </span>
                    {row.hours.map((value, h) => {
                      const bin = heatBin(heatIntensity(value, row, globalMax, scale === "row"));
                      const isPeak = h === peakH;
                      return (
                        <div
                          key={h}
                          role="cell"
                          aria-label={`${row.label}, ${hourRangeLabel(h)}: ${value} ${value === 1 ? "conversa" : "conversas"}${isPeak ? ", pico do departamento" : ""}`}
                          data-tip={tipText(
                            `${row.label} · ${hourRangeLabel(h)}`,
                            `${formatNumber(value)} ${value === 1 ? "conversa" : "conversas"} · ${shareLabel(value, row.total)} do depto.`,
                            isPeak && "Pico do departamento",
                          )}
                          className={cn(
                            "relative grid h-[26px] place-items-center rounded-xs hover:outline hover:outline-2 hover:outline-offset-1 hover:outline-foreground",
                            bin === 0 && "shadow-[inset_0_0_0_1px_var(--border)]",
                          )}
                          style={{ background: heatFill(color, bin) }}
                        >
                          {isPeak && max > 0 ? (
                            <span aria-hidden className="size-1.5 rounded-full bg-card" />
                          ) : null}
                        </div>
                      );
                    })}
                    <div
                      role="cell"
                      data-tip={tipText(
                        row.label,
                        `${formatNumber(row.total)} conversas · ${shareLabel(row.total, grand)} do total`,
                      )}
                      className="grid grid-cols-[minmax(0,1fr)_2.6rem] items-center gap-1.5 pl-1.5 text-right text-xs font-semibold tabular-nums"
                    >
                      <div className="relative h-1.5 rounded-xs bg-secondary" aria-hidden>
                        <div
                          className="absolute inset-y-0 left-0 min-w-[3px] rounded-xs"
                          style={{
                            width: `${rowMax > 0 ? (row.total / rowMax) * 100 : 0}%`,
                            background: color,
                          }}
                        />
                      </div>
                      {formatNumber(row.total)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <span>{scale === "global" ? "Conversas por hora" : "Em relação ao pico do depto."}</span>
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="size-2.5 rounded-xs shadow-[inset_0_0_0_1px_var(--border)]" />0
            </span>
            {(scale === "global"
              ? ranges.map((r) => ({
                  bin: r.bin,
                  label:
                    r.from === r.to
                      ? formatNumber(r.from)
                      : `${formatNumber(r.from)}–${formatNumber(r.to)}`,
                }))
              : Array.from({ length: HEAT_BINS }, (_, i) => ({
                  bin: i + 1,
                  label: `até ${((i + 1) * 100) / HEAT_BINS}%`,
                }))
            ).map((b) => (
              <span key={b.bin} className="inline-flex items-center gap-1.5 tabular-nums">
                <i
                  aria-hidden
                  className="size-2.5 rounded-xs"
                  style={{ background: heatFill(color, b.bin) }}
                />
                {b.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className="size-1.5 rounded-full bg-foreground/70" />
              pico do depto.
            </span>
            {peak ? (
              <span className="tabular-nums">
                Hora de pico: <b className="text-foreground">{hh(peak.hour)}</b> (
                {formatNumber(peak.value)} conversas)
              </span>
            ) : null}
          </div>
        </TipScope>
      )}
    </PainelCard>
  );
}

// ---------------------------------------------------------------------------
// 2 + 3. Rankings por atendente (lado a lado)

export function TeamRankingsWidget({
  block,
  search,
  filtered,
  notice,
  clock,
  onRetry,
}: {
  block: PainelBlock<PainelTeamRanking> | undefined;
  search: string;
  filtered: boolean;
  notice?: string | null;
  /** Relógio global (cabeçalho): só vira rótulo do ranking de tempo. */
  clock: DashboardClock;
  onRetry: () => void;
}) {
  if (teamBlockPending(block)) {
    return (
      <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-2">
        <PainelSkeleton className="min-h-[220px]" />
        <PainelSkeleton className="min-h-[220px]" />
      </div>
    );
  }
  if (!block!.ok) return <PainelBlockError message={block!.error} onRetry={onRetry} />;
  return (
    <div className="grid grid-cols-1 items-start gap-1.5 lg:grid-cols-2">
      <AttendedRanking
        rows={block!.data.rows}
        search={search}
        filtered={filtered}
        notice={notice}
      />
      <ServiceTimeRanking
        rows={block!.data.rows}
        capped={block!.data.capped}
        search={search}
        filtered={filtered}
        notice={notice}
        clock={clock}
      />
    </div>
  );
}

function AttendedRanking({
  rows: all,
  search,
  filtered,
  notice,
}: {
  rows: PainelTeamRankRow[];
  search: string;
  filtered: boolean;
  notice?: string | null;
}) {
  const color = MEASURE_COLOR.conversations;
  const ranked = useMemo(() => rankByAttended(all), [all]);
  const total = ranked.reduce((acc, r) => acc + r.attended, 0);
  const rows = ranked.filter((r) => textMatchesQuery(r.name, search));

  return (
    <PainelCard
      title="Ranking de atendimentos"
      subtitle={teamSubtitle("Conversas do período que passaram pelo atendente", { filtered, notice })}
      info="Conta a conversa para todo atendente que a recebeu (responsável atual + distribuições). Uma conversa transferida aparece para os dois, então a soma pode passar do total de conversas. 'Encerradas' são as conversas que o atendente encerrou no período: nunca passam do total da barra."
    >
      {rows.length === 0 ? (
        <PainelEmpty embedded title="Não há atendimentos no período" />
      ) : (
        <RankBarList
          variant="rank"
          ariaLabel="Ranking de atendimentos por atendente"
          color={color}
          limit={TOP_N}
          rows={rows.map((r) => {
            const p = attendedParts(r.attended, r.finished);
            return {
              id: r.id,
              label: r.name,
              value: p.total,
              innerValue: p.closed,
              detail: `${p.closedPct.toLocaleString("pt-BR")}% encerradas`,
              display: formatNumber(p.total),
              displayDetail: `${formatNumber(p.open)} em aberto`,
              tip: [
                r.name,
                `${formatNumber(p.total)} atendimentos · ${shareLabel(p.total, total)}`,
                `${formatNumber(p.closed)} encerradas · ${formatNumber(p.open)} em aberto`,
              ],
            };
          })}
          footer={
            <>
              <LegendSwatch color={color} label="Encerradas" />
              <LegendSwatch color={color} tone="open" label="Total (em aberto)" />
              <span className="tabular-nums">
                {ranked.length} atendentes · {formatNumber(total)} atendimentos
              </span>
            </>
          }
        />
      )}
    </PainelCard>
  );
}

function ServiceTimeRanking({
  rows: all,
  capped,
  search,
  filtered,
  notice,
  clock,
}: {
  rows: PainelTeamRankRow[];
  capped: boolean;
  search: string;
  filtered: boolean;
  notice?: string | null;
  clock: DashboardClock;
}) {
  const color = MEASURE_COLOR.time;
  const [order, setOrder] = useState<"fast" | "slow">("fast");
  const teamMean = useMemo(() => teamMeanMs(all), [all]);
  const status = useMemo(() => serviceRankingState(all), [all]);
  const rows = useMemo(
    () => rankByServiceTime(all, order === "slow").filter((r) => textMatchesQuery(r.name, search)),
    [all, order, search],
  );
  const axis = useMemo(() => durationAxis(axisMaxMs(rows, teamMean)), [rows, teamMean]);
  const x = (ms: number) => Math.max(0, Math.min(100, (ms / axis.maxMs) * 100));
  const fasterCount = teamMean == null ? 0 : rows.filter((r) => (r.serviceMeanMs ?? 0) < teamMean).length;

  return (
    <PainelCard
      wrapAction
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <SegmentedToggle
            label="Ordem"
            value={order}
            onChange={setOrder}
            options={[
              { value: "fast", label: "Rápidos" },
              { value: "slow", label: "Lentos" },
            ]}
          />
        </div>
      }
      title="Ranking de tempo médio de atendimento"
      subtitle={teamSubtitle(
        `Abertura → encerramento · ${clockLabel(clock)}`,
        { filtered, notice },
      )}
      info={`Tempo médio entre abrir e encerrar as conversas encerradas no período, creditado a quem estava responsável no encerramento. Entra quem encerrou ao menos ${MIN_SERVICE_SAMPLE} conversas. Ponto cheio = média, ponto vazado = mediana; a linha vertical marca a média da equipe.`}
    >
      {status.state === "empty" || rows.length === 0 ? (
        <PainelEmpty
          embedded
          title="Sem encerramentos suficientes"
          description={`Ninguém encerrou ${MIN_SERVICE_SAMPLE}+ conversas neste recorte.`}
        />
      ) : (
        <RankBarList
          variant="rank"
          ariaLabel="Ranking de tempo médio de atendimento por atendente"
          color={color}
          limit={TOP_N}
          trackHeader={() => (
            <>
              {axis.ticks.map((t, i) => (
                <span
                  key={t}
                  className={cn(
                    "absolute tabular-nums",
                    i === 0 ? "" : i === axis.ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                    // No celular só cabem alguns rótulos.
                    i % 2 === 1 && i !== axis.ticks.length - 1 && "max-sm:hidden",
                  )}
                  style={{ left: `${x(t)}%` }}
                >
                  {axisDurationLabel(t)}
                </span>
              ))}
            </>
          )}
          rows={rows.map((r) => {
            const mean = r.serviceMeanMs ?? 0;
            const median = r.serviceMedianMs ?? mean;
            const delta = deltaFromTeam(r.serviceMeanMs, teamMean);
            const deltaText =
              delta.kind === "on"
                ? "na média"
                : delta.kind === "faster"
                  ? `▼ ${formatDurationMs(delta.ms)}`
                  : delta.kind === "slower"
                    ? `▲ ${formatDurationMs(delta.ms)}`
                    : undefined;
            const lo = Math.min(mean, median);
            const hi = Math.max(mean, median);
            return {
              id: r.id,
              label: r.name,
              value: mean,
              detail: `${formatNumber(r.serviceSample)} encerradas`,
              display: formatDurationMs(mean),
              displayDetail: deltaText,
              tip: [
                r.name,
                `Média ${formatDurationMs(mean)} · mediana ${formatDurationMs(median)}`,
                `${formatNumber(r.serviceSample)} conversas encerradas`,
                delta.kind === "faster"
                  ? `${formatDurationMs(delta.ms)} mais rápido que a média da equipe`
                  : delta.kind === "slower"
                    ? `${formatDurationMs(delta.ms)} mais lento que a média da equipe`
                    : delta.kind === "on"
                      ? "Na média da equipe"
                      : "",
              ],
              track: (
                <div className="relative h-[18px]" aria-hidden>
                  <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
                  {teamMean != null ? (
                    <span
                      className="absolute -bottom-2 -top-2 w-px bg-foreground/55"
                      style={{ left: `${x(teamMean)}%` }}
                    />
                  ) : null}
                  <span
                    className="absolute top-1/2 -mt-px h-0.5 opacity-45"
                    style={{
                      left: `${x(lo)}%`,
                      width: `${x(hi) - x(lo)}%`,
                      background: color,
                    }}
                  />
                  <span
                    className="absolute top-1/2 -ml-[5px] -mt-[5px] size-2.5 rounded-full bg-card"
                    style={{ left: `${x(median)}%`, boxShadow: `inset 0 0 0 2px ${color}` }}
                  />
                  <span
                    className="absolute top-1/2 -ml-[5px] -mt-[5px] size-2.5 rounded-full"
                    style={{
                      left: `${x(mean)}%`,
                      background: color,
                      boxShadow: "0 0 0 2px var(--card)",
                    }}
                  />
                </div>
              ),
            };
          })}
          footer={
            <>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
                Média
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ boxShadow: `inset 0 0 0 2px ${color}` }}
                />
                Mediana
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className="h-3 w-px bg-foreground/55" />
                Média da equipe{" "}
                <b className="text-foreground">{formatDurationMs(teamMean)}</b>
              </span>
              <span className="tabular-nums">
                {fasterCount} de {rows.length} abaixo da média
                {status.left > 0
                  ? ` · ${status.left} com menos de ${MIN_SERVICE_SAMPLE} encerradas fora`
                  : ""}
                {capped ? " · amostra das 10 mil mais recentes" : ""}
              </span>
            </>
          }
        />
      )}
    </PainelCard>
  );
}
