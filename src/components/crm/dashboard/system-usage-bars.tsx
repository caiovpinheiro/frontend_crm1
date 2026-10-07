"use client";

import { IconAlertTriangle } from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { LegendSwatch, RankBarList } from "@/components/crm/dashboard/rank-bar-list";
import { SegmentedToggle } from "@/components/crm/dashboard/segmented-toggle";
import { MEASURE_COLOR, isBelowAverage } from "@/features/dashboard-v2/measure-colors";
import {
  LOW_USAGE_SECONDS,
  sortUsage,
  usageDelta,
  type UsageRowInput,
  type UsageSort,
} from "@/features/dashboard-v2/usage-stats";

export type SystemUsageBarRow = UsageRowInput;

const TOP_N = 10;

/**
 * Uso do sistema por usuário (violeta = tempo): barras ordenadas, linha da média
 * com rótulo, diferença para a média em cada linha e tom claro abaixo dela.
 */
export function SystemUsageBars({
  rows,
  average,
  formatValue,
}: {
  rows: SystemUsageBarRow[];
  average: number;
  formatValue: (seconds: number) => string;
}) {
  const [sort, setSort] = useState<UsageSort>("time");
  const sorted = useMemo(() => sortUsage(rows, sort), [rows, sort]);
  const color = MEASURE_COLOR.time;
  const max = Math.max(1, ...rows.map((row) => row.seconds));
  const showAverage = average > 0;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex justify-end">
        <SegmentedToggle
          label="Ordenar usuários"
          value={sort}
          onChange={setSort}
          options={[
            { value: "time", label: "Tempo" },
            { value: "name", label: "A–Z" },
          ]}
        />
      </div>
      <RankBarList
        variant="rank"
        ariaLabel="Tempo de uso do sistema por usuário"
        color={color}
        max={max}
        limit={sort === "time" ? TOP_N : undefined}
        reference={showAverage ? { value: average } : null}
        trackHeader={({ referencePct }) =>
          referencePct != null ? (
            <span
              className="absolute -translate-x-1/2 whitespace-nowrap font-semibold text-foreground"
              style={{ left: `${referencePct}%` }}
            >
              média {formatValue(average)}
            </span>
          ) : null
        }
        rows={sorted.map((row) => {
          const delta = usageDelta(row.seconds, average);
          const deltaText =
            delta.kind === "on"
              ? "na média"
              : `${delta.kind === "below" ? "−" : "+"}${formatValue(delta.seconds)}`;
          return {
            id: row.id,
            label: row.name,
            value: row.seconds,
            soft: isBelowAverage(row.seconds, average),
            display: formatValue(row.seconds),
            displayDetail: deltaText,
            badge:
              row.seconds < LOW_USAGE_SECONDS ? (
                <IconAlertTriangle
                  className="size-3.5 shrink-0 text-warning"
                  aria-label="Uso abaixo de 1h"
                />
              ) : null,
            tip: [
              row.name,
              `${formatValue(row.seconds)} ativos hoje`,
              delta.kind === "on"
                ? "Na média"
                : `${formatValue(delta.seconds)} ${delta.kind === "below" ? "abaixo" : "acima"} da média`,
            ],
          };
        })}
        footer={
          <>
            <span className="tabular-nums">{rows.length} usuários com sessão hoje</span>
            <LegendSwatch color={color} label="Na média ou acima" />
            <LegendSwatch color={color} tone="soft" label="Abaixo da média" />
          </>
        }
      />
    </div>
  );
}
