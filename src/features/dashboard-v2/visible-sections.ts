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

/**
 * Grupos do `usePainelService` (um GET por grupo, em paralelo): volume, leves
 * e pesadas. Cada grupo sai quando um widget que o usa entra na tela.
 */
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

/** Seções de `/api/painel/deals` (aba Negócios). */
export type DealSection =
  | "kpis"
  | "funnel"
  | "evolution"
  | "agents"
  | "sources"
  | "exceptions";

export const DEAL_SECTIONS: readonly DealSection[] = [
  "kpis",
  "funnel",
  "evolution",
  "agents",
  "sources",
  "exceptions",
];

/**
 * Seções que cada widget da grade de Negócios lê. O funil também lê `kpis`
 * (coluna Ganhos: quantidade e receita ganha); os cards de etapa leem o funil.
 * "usage" e os cards personalizados têm rotas próprias.
 */
const DEAL_WIDGET_SECTIONS: Record<string, readonly DealSection[]> = {
  kpis: ["kpis"],
  funnel: ["funnel", "kpis"],
  stages: ["funnel"],
  evolution: ["evolution"],
  agents: ["agents"],
  sources: ["sources"],
  exceptions: ["exceptions"],
};

export function dealSectionsFor(visibleIds: readonly string[]): DealSection[] {
  const out = new Set<DealSection>();
  for (const id of visibleIds) {
    const sections = id.startsWith("stage:") ? DEAL_WIDGET_SECTIONS.stages : DEAL_WIDGET_SECTIONS[id];
    for (const section of sections ?? []) out.add(section);
  }
  // Ordem fixa: a chave da query não muda com a ordem da grade.
  return DEAL_SECTIONS.filter((s) => out.has(s));
}

/**
 * Cards de evento cujo valor vem do volume de `/api/painel/service` (não de
 * `/api/activity-feed/stats`). "avg_response" lê o bloco de tempo.
 */
export const SERVICE_EVENT_CARD_TYPES: readonly string[] = [
  "messages_in",
  "messages_out",
  "queue",
  "avg_response",
];

/** Algum card de evento visível conta eventos do log (`activity-feed/stats`)? */
export function eventCardsNeedActivityStats(
  cards: readonly { eventType?: string }[],
): boolean {
  return cards.some((c) => !SERVICE_EVENT_CARD_TYPES.includes(c.eventType ?? ""));
}

/**
 * Altura reservada (px) para um widget da aba Atendimentos enquanto os dados
 * dele não chegam. Sem isto todos os esqueletos teriam ~72 px e caberiam na
 * primeira dobra — a carga por intersecção pediria tudo de uma vez.
 */
const WIDGET_PLACEHOLDER_PX: Record<string, number> = {
  agora: 200,
  volume: 420,
  heatmap: 380,
  tempo: 380,
  summaries: 320,
  connections: 320,
  attendants: 420,
  channels: 380,
  exceptions: 160,
  deptHour: 380,
  teamRankings: 320,
  transfers: 360,
  kpis: 96,
  top: 320,
  byUser: 260,
  log: 420,
};

export function widgetPlaceholderPx(id: string): number {
  return WIDGET_PLACEHOLDER_PX[id] ?? 240;
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
