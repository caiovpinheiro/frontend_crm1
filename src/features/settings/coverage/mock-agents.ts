import type { Schedule } from "@/features/settings/schedules/schedule-shared";
import { isPageMockMode } from "@/lib/page-mock-mode";

import type { AgentPresence, CoverageAgent, CoverageDepartment } from "./schedule-data";

/**
 * Roster ilustrativo (V2) da grade de cobertura.
 * Usado SOMENTE quando a API retorna vazio em ambiente local/dev
 * (localhost ou `?mock=1`) — dados reais sempre vencem.
 */

const SAC: CoverageDepartment = { id: "dept-sac", name: "SAC", color: "#3b82f6" };
const RETENCAO: CoverageDepartment = {
  id: "dept-retencao",
  name: "Retenção",
  color: "#f59e0b",
};
const ACOLHIMENTO: CoverageDepartment = {
  id: "dept-acolhimento",
  name: "Acolhimento",
  color: "#10b981",
};

const WEEKDAYS = [1, 2, 3, 4, 5];

function schedule(
  startTime: string,
  endTime: string,
  lunchStart: string,
  lunchEnd: string,
): Schedule {
  return {
    startTime,
    lunchStart,
    lunchEnd,
    endTime,
    timezone: "America/Sao_Paulo",
    weekdays: [...WEEKDAYS],
  };
}

function emailFor(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name;
  const slug = first
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return `${slug}@example.com`;
}

let seq = 0;
function mk(
  name: string,
  sched: Schedule,
  departments: CoverageDepartment[],
  presence: AgentPresence,
  extra?: Partial<CoverageAgent>,
): CoverageAgent {
  seq += 1;
  return {
    id: `mock-cov-${seq}`,
    name,
    email: emailFor(name),
    role: "AGENT",
    avatarUrl: null,
    schedule: sched,
    participates: true,
    visibleInCoverage: true,
    agentStatus: { status: presence, updatedAt: new Date().toISOString() },
    departments,
    ...extra,
  };
}

export const MOCK_COVERAGE_AGENTS: CoverageAgent[] = [
  mk("Alice Demo", schedule("09:00", "18:00", "13:00", "14:00"), [SAC], "ONLINE"),
  mk("Bruno Demo", schedule("08:00", "17:00", "13:30", "14:30"), [SAC], "ONLINE"),
  mk("Carla Demo", schedule("08:00", "18:00", "12:00", "13:00"), [], "OFFLINE", {
    participates: false,
  }),
  mk(
    "Daniel Demo",
    schedule("09:00", "19:00", "14:00", "15:00"),
    [RETENCAO, ACOLHIMENTO],
    "ONLINE",
  ),
  mk("Elisa Demo", schedule("09:00", "19:00", "14:30", "15:30"), [SAC], "ONLINE"),
  mk("Fábio Demo", schedule("13:00", "19:00", "16:00", "17:00"), [SAC], "AWAY"),
  mk("Gabriela Demo", schedule("10:00", "19:00", "14:00", "15:00"), [SAC], "ONLINE"),
  mk(
    "Heitor Demo",
    schedule("10:00", "19:00", "15:00", "16:00"),
    [SAC],
    "ONLINE",
  ),
  mk("Isabel Demo", schedule("08:00", "17:00", "12:30", "13:30"), [SAC], "ONLINE"),
  mk("Jorge Demo", schedule("09:00", "18:00", "13:00", "14:00"), [ACOLHIMENTO], "ONLINE"),
  mk(
    "Lívia Demo",
    schedule("09:00", "18:00", "13:00", "14:00"),
    [RETENCAO, ACOLHIMENTO],
    "ONLINE",
  ),
];

/**
 * Gate do mock:
 * - `?mock=1` FORÇA mocks (ignora dados reais) — útil para validar UI local
 * - sem ?mock=1, mocks aparecem só quando a API vem vazia em localhost/dev
 */
export function shouldUseCoverageMock(opts: {
  realCount: number;
  isLoading: boolean;
}): boolean {
  if (opts.isLoading) return false;
  // ?mock=1 força mocks independente de dados reais
  if (isPageMockMode()) return true;
  // Sem forçar, dados reais vencem
  if (opts.realCount > 0) return false;
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "localhost" || h.startsWith("127.");
}
