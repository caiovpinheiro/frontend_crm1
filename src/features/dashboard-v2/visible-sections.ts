/*
 * Quais blocos do backend a aba Atendimentos precisa, a partir dos widgets que
 * estão visíveis (ordem/visibilidade salva). Widget oculto não gera requisição.
 * Puro — testado em visible-sections.test.ts.
 */

import type { PainelTeamSection } from "./painel-api";

export type ServiceSection =
  | "volume"
  | "heatmap"
  | "connections"
  | "exceptions"
  | "tempo"
  | "byDepartment"
  | "attendants"
  | "channels";

/** Ondas do `usePainelService`: volume sozinho, leves e pesadas (nesta ordem). */
export const SERVICE_VOLUME_SECTIONS: readonly ServiceSection[] = ["volume"];
export const SERVICE_REST_SECTIONS: readonly ServiceSection[] = [
  "heatmap",
  "connections",
  "exceptions",
];
export const SERVICE_HEAVY_SECTIONS: readonly ServiceSection[] = [
  "tempo",
  "byDepartment",
  "attendants",
  "channels",
];

/** Seções de `/api/painel/service` que cada widget lê (o "agora" tem rota própria). */
const SERVICE_WIDGET_SECTIONS: Record<string, readonly ServiceSection[]> = {
  volume: ["volume"],
  heatmap: ["heatmap", "byDepartment"],
  tempo: ["tempo"],
  summaries: ["byDepartment", "attendants"],
  connections: ["connections"],
  attendants: ["byDepartment", "attendants"],
  channels: ["channels"],
  exceptions: ["exceptions"],
};

/** Blocos de `/api/painel/team` de cada widget. */
const TEAM_WIDGET_SECTIONS: Record<string, PainelTeamSection> = {
  deptHour: "deptHour",
  teamRankings: "ranking",
  transfers: "transfers",
};

export function serviceSectionsFor(visibleIds: readonly string[]): ServiceSection[] {
  const out = new Set<ServiceSection>();
  for (const id of visibleIds) {
    for (const section of SERVICE_WIDGET_SECTIONS[id] ?? []) out.add(section);
  }
  return [...out];
}

/**
 * Widgets visíveis cujas seções de `/api/painel/service` estão TODAS
 * indisponíveis (sem réplica de leitura): somem do grid. Com ao menos uma
 * seção disponível o widget fica e omite só a parte que falta.
 */
export function unavailableServiceWidgets(
  visibleIds: readonly string[],
  isUnavailable: (section: ServiceSection) => boolean,
): string[] {
  return visibleIds.filter((id) => {
    const sections = SERVICE_WIDGET_SECTIONS[id];
    return Boolean(sections?.length) && sections!.every(isUnavailable);
  });
}

/** Quantas seções (gráficos) dos widgets visíveis estão indisponíveis. */
export function countUnavailableSections(
  visibleIds: readonly string[],
  isUnavailable: (section: ServiceSection) => boolean,
): number {
  return serviceSectionsFor(visibleIds).filter(isUnavailable).length;
}

export function teamSectionsFor(visibleIds: readonly string[]): PainelTeamSection[] {
  const out = new Set<PainelTeamSection>();
  for (const id of visibleIds) {
    const section = TEAM_WIDGET_SECTIONS[id];
    if (section) out.add(section);
  }
  return [...out];
}

export type ServiceWaves = {
  volume: ServiceSection[];
  rest: ServiceSection[];
  heavy: ServiceSection[];
};

/** Reparte as seções nas ondas, preservando a ordem de cada onda. */
export function splitServiceWaves(sections: readonly ServiceSection[]): ServiceWaves {
  const want = new Set(sections);
  const pick = (wave: readonly ServiceSection[]) => wave.filter((s) => want.has(s));
  return {
    volume: pick(SERVICE_VOLUME_SECTIONS),
    rest: pick(SERVICE_REST_SECTIONS),
    heavy: pick(SERVICE_HEAVY_SECTIONS),
  };
}

/** União ordenada: esconder um widget não troca a chave da query (não refaz o GET). */
export function growSections<T extends string>(prev: readonly T[], next: readonly T[]): T[] {
  const merged = new Set<T>([...prev, ...next]);
  if (merged.size === prev.length) return prev as T[];
  return [...merged].sort();
}
