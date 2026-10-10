"use client";

import { useState } from "react";

import { SystemUsageCard } from "@/components/crm/dashboard/system-usage-card";
import {
  DASHBOARD_CHART_TYPES,
  DASHBOARD_CHART_TYPE_LABELS,
  type DashboardChartType,
} from "@/features/dashboard-v2/chart-types";
import type { SystemUsageAggregateRow } from "@/features/system-usage/types";
import { cn } from "@/lib/utils";

/** Dados fictícios — nomes inventados, só para o showcase do card. */
function mockRows(entries: Array<[string, number]>): SystemUsageAggregateRow[] {
  return entries.map(([name, minutes], index) => ({
    userId: `mock-${index}`,
    userName: name,
    userEmail: null,
    avatarUrl: null,
    activeNow: index % 3 === 0,
    lastActivityAt: null,
    totalSeconds: minutes * 60,
    sessionCount: 1,
    averageSessionSeconds: minutes * 60,
    interactionCount: 0,
  }));
}

const DIA_TIPICO = mockRows([
  ["Ana Ribeiro", 18],
  ["Bruno Teixeira", 257],
  ["Carla Mendes", 80],
  ["Diego Antunes", 103],
  ["Elisa Prado", 104],
  ["Fábio Lacerda", 90],
  ["Gabriela Nunes", 258],
  ["Helena Duarte dos Santos", 251],
  ["Igor Fontes", 273],
  ["Júlia Moraes", 265],
  ["Admin", 76],
  ["Karen Siqueira", 244],
  ["Lucas Barreto", 257],
  ["Marina Coelho", 282],
  ["Nathan Rocha", 124],
  ["Olívia Campos", 241],
]);

const EQUIPE_PEQUENA = mockRows([
  ["Ana Ribeiro", 312],
  ["Bruno Teixeira", 45],
  ["Carla Mendes", 198],
]);

const DIA_LONGO = mockRows([
  ["Ana Ribeiro", 610],
  ["Bruno Teixeira", 545],
  ["Carla Mendes", 380],
  ["Diego Antunes", 122],
  ["Elisa Prado", 35],
]);

function Scenario({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default function SystemUsagePreviewPage() {
  const [type, setType] = useState<DashboardChartType>("bar");

  return (
    <main className="min-h-screen bg-background px-4 py-6 sm:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-[22px] font-bold tracking-tight text-foreground">
              Uso do sistema — showcase
            </h1>
            <p className="text-sm text-muted-foreground">
              Card real do dashboard com dados fictícios.
            </p>
          </div>
          <div
            role="group"
            aria-label="Tipo de gráfico"
            className="inline-flex flex-wrap gap-0.5 rounded-full border border-border bg-card p-0.5"
          >
            {DASHBOARD_CHART_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={type === option}
                onClick={() => setType(option)}
                className={cn(
                  "h-7 rounded-full px-3 text-[12px] font-semibold",
                  type === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {DASHBOARD_CHART_TYPE_LABELS[option]}
              </button>
            ))}
          </div>
        </header>

        <Scenario title="Dia típico · 16 usuários">
          <SystemUsageCard rows={DIA_TIPICO} chartType={type} />
        </Scenario>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Scenario title="Equipe pequena · 3 usuários">
            <SystemUsageCard rows={EQUIPE_PEQUENA} chartType={type} />
          </Scenario>
          <Scenario title="Dia longo · acima de 8h (escala de 2 em 2h)">
            <SystemUsageCard rows={DIA_LONGO} chartType={type} />
          </Scenario>
        </div>

        <Scenario title="Sem uso no dia">
          <SystemUsageCard rows={[]} chartType={type} />
        </Scenario>
      </div>
    </main>
  );
}
