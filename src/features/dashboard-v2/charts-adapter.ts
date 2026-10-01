/*
 * Adapter entre as respostas da API e os tipos de
 * `components/painel/charts/types`. Os componentes de gráfico não conhecem o
 * formato da API — tudo que vem de `/api/painel/service` e
 * `/api/analytics/tabulations` passa por aqui.
 *
 * Duas conversões não óbvias:
 *  - a API devolve tempos em MILISSEGUNDOS; os gráficos esperam MINUTOS;
 *  - `null` (sem amostra no período) é preservado até a renderização, que
 *    mostra "—" em vez de tratar como zero dentro da meta.
 */

import type {
  AgentStat,
  ChannelStat,
  DepartmentStat,
  ReasonStat,
  Tabulation,
  UserTabulationCount,
} from "@/components/painel/charts/types";

import type {
  PainelAttendantRow,
  PainelBlock,
  PainelChannelRow,
  PainelDeptTableRow,
  PainelServiceResult,
} from "./painel-api";
import type { TabulationAnalyticsResponse } from "./use-tabulation-analytics";

const MS_PER_MINUTE = 60_000;

/** Separador usado pelo backend ao montar o path da árvore de tabulações. */
const TABULATION_PATH_SEPARATOR = "›";

/** Categoria exibida quando a tabulação está na raiz e não tem departamento. */
export const TABULATION_CATEGORY_FALLBACK = "Sem categoria";

/** `null` = sem amostra no período; propaga como `null`, nunca como 0. */
function msToMinutes(ms: number | null | undefined): number | null {
  if (ms == null || !Number.isFinite(ms)) return null;
  return ms / MS_PER_MINUTE;
}

function blockData<T>(block: PainelBlock<T> | undefined): T | undefined {
  return block?.ok ? block.data : undefined;
}

function fromDepartmentRow(row: PainelDeptTableRow): DepartmentStat {
  return {
    id: row.key,
    name: row.label,
    finished: row.finished,
    open: row.stillOpen,
    avgFirstResponseMin: msToMinutes(row.responseMeanMs),
    avgStartMin: msToMinutes(row.startMeanMs),
    avgDurationMin: msToMinutes(row.serviceMeanMs),
  };
}

function fromAttendantRow(row: PainelAttendantRow): AgentStat {
  return {
    id: row.id,
    name: row.name,
    finished: row.finished,
    open: row.stillOpen,
    avgFirstResponseMin: msToMinutes(row.responseMeanMs),
    avgStartMin: msToMinutes(row.startMeanMs),
    avgDurationMin: msToMinutes(row.serviceMeanMs),
  };
}

export function toDepartmentStats(
  service: PainelServiceResult | undefined,
): DepartmentStat[] {
  const rows = blockData(service?.byDepartment)?.table ?? [];
  return rows.map(fromDepartmentRow);
}

export function toAgentStats(
  service: PainelServiceResult | undefined,
): AgentStat[] {
  const rows = blockData(service?.attendants)?.rows ?? [];
  return rows.map(fromAttendantRow);
}

export function toChannelStats(
  service: PainelServiceResult | undefined,
): ChannelStat[] {
  const rows = blockData(service?.channels)?.channels ?? [];
  return rows.map(
    (row: PainelChannelRow): ChannelStat => ({
      channel: row.label,
      count: row.count,
      medianFirstResponseMin: msToMinutes(row.firstResponseMedianMs),
    }),
  );
}

export function toReasonStats(
  service: PainelServiceResult | undefined,
): ReasonStat[] {
  const rows = blockData(service?.channels)?.motivos ?? [];
  return rows.map(
    (row: PainelChannelRow): ReasonStat => ({
      reason: row.label,
      count: row.count,
      medianFirstResponseMin: msToMinutes(row.firstResponseMedianMs),
    }),
  );
}

/**
 * O backend monta `path` juntando os ancestrais ("Comercial › Sem interesse").
 * A categoria é o nó raiz; folha sem pai cai no departamento da árvore.
 */
function tabulationCategory(row: {
  path: string;
  name: string;
  departmentName: string | null;
}): string {
  const segments = row.path
    .split(TABULATION_PATH_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (segments.length > 1) return segments[0] ?? TABULATION_CATEGORY_FALLBACK;
  const department = row.departmentName?.trim();
  return department && department.length > 0
    ? department
    : TABULATION_CATEGORY_FALLBACK;
}

export function toTabulations(
  response: TabulationAnalyticsResponse | undefined,
): Tabulation[] {
  return toTabulationsFromRows(response?.byTabulation ?? []);
}

/** Aceita as linhas já filtradas pela busca da tela. */
export function toTabulationsFromRows(
  rows: TabulationAnalyticsResponse["byTabulation"],
): Tabulation[] {
  return rows.map(
    (row): Tabulation => ({
      category: tabulationCategory({
        path: row.path,
        name: row.name,
        departmentName: row.departmentName,
      }),
      reason: row.name,
      count: row.count,
    }),
  );
}

export function toUserTabulationCounts(
  response: TabulationAnalyticsResponse | undefined,
): UserTabulationCount[] {
  return toUserTabulationCountsFromRows(response?.byUser ?? []);
}

/** Aceita as linhas já filtradas pela busca da tela. */
export function toUserTabulationCountsFromRows(
  rows: TabulationAnalyticsResponse["byUser"],
): UserTabulationCount[] {
  return rows.map(
    (row): UserTabulationCount => ({
      id: row.userId,
      name: row.name,
      count: row.count,
    }),
  );
}

/** Formato consumido pelos cards de tabulação (top 20 do ranking). */
export type TabulationChartsData = {
  tabulations: Tabulation[];
  users: UserTabulationCount[];
  /** Total real do período — `tabulations` é o ranking truncado no top 20. */
  total: number;
  distinctTabulations: number;
  distinctUsers: number;
};

/** Usado no `select` da query de tabulações. */
export function toTabulationChartsData(
  response: TabulationAnalyticsResponse,
): TabulationChartsData {
  return {
    tabulations: toTabulations(response),
    users: toUserTabulationCounts(response),
    total: response.total,
    distinctTabulations: response.distinctTabulations,
    distinctUsers: response.distinctUsers,
  };
}

/** Formato consumido pelos cards que vêm de `/api/painel/service`. */
export type ServiceChartsData = {
  departments: DepartmentStat[];
  agents: AgentStat[];
  channels: ChannelStat[];
  reasons: ReasonStat[];
};

export function toServiceChartsData(
  service: PainelServiceResult | undefined,
): ServiceChartsData {
  return {
    departments: toDepartmentStats(service),
    agents: toAgentStats(service),
    channels: toChannelStats(service),
    reasons: toReasonStats(service),
  };
}
