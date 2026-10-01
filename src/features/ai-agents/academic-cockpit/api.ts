/**
 * Cockpit do agente acadêmico — nativo no CRM.
 *
 * A chamada é same-origin (`/api/public/agent-cockpit` passa pelo rewrite do
 * Next para o backend), então o cookie `authjs.session-token` viaja junto e o
 * backend resolve a organização pela sessão. Sem token de embed, sem CORS,
 * sem env: nada precisa ser configurado para a página funcionar.
 */

import { apiUrl, parseApiResponse } from "@/lib/api";

import type {
  AcademicCaseKey,
  AcademicCockpit,
  AcademicCockpitCase,
  AgentCockpitResponse,
  NamedCount,
} from "./types";

/** Número finito sempre — evita `NaN`/`undefined` chegando na tela. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Número ou `null` (para os campos que a UI mostra como "—"). */
function nullableNum(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function namedCounts(value: unknown): NamedCount[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => ({
      name: typeof item.name === "string" && item.name.trim() ? item.name : "—",
      n: num(item.n),
    }));
}

/**
 * Normaliza o payload antes de chegar aos componentes. Em DEV as métricas vêm
 * zeradas (o banco com dados reais é o de produção) — e é justamente esse o
 * caminho que precisa renderizar bonito, sem `NaN` nem lista `undefined`.
 */
function normalizeAcademic(raw: AcademicCockpit): AcademicCockpit {
  const saude = raw.saude ?? ({} as AcademicCockpit["saude"]);
  const resolucao = raw.resolucao ?? ({} as AcademicCockpit["resolucao"]);
  const handoff = raw.handoff ?? ({} as AcademicCockpit["handoff"]);
  const funil = raw.funil ?? ({} as AcademicCockpit["funil"]);

  return {
    saude: {
      agentActive: Boolean(saude.agentActive),
      agentName:
        typeof saude.agentName === "string" && saude.agentName.trim()
          ? saude.agentName
          : null,
      spokeToday: num(saude.spokeToday),
      attendingNow: num(saude.attendingNow),
      resolvedSoloToday: num(saude.resolvedSoloToday),
      handoffToday: num(saude.handoffToday),
      sendFailedToday: num(saude.sendFailedToday),
      firstResponseMedianSec: nullableNum(saude.firstResponseMedianSec),
    },
    resolucao: {
      closedByAiToday: num(resolucao.closedByAiToday),
      closedByIdle: num(resolucao.closedByIdle),
      closedByStudentAsk: num(resolucao.closedByStudentAsk),
      idleNudgesToday: num(resolucao.idleNudgesToday),
      returnedAfterAiClose: num(resolucao.returnedAfterAiClose),
    },
    handoff: {
      totalToday: num(handoff.totalToday),
      byDepartment: namedCounts(handoff.byDepartment),
      byKind: namedCounts(handoff.byKind),
    },
    funil: {
      academicChannelSpoke: num(funil.academicChannelSpoke),
      otherChannelSpoke: num(funil.otherChannelSpoke),
      byStage: namedCounts(funil.byStage),
      leadDeEntradaOpen: num(funil.leadDeEntradaOpen),
      leadDeEntradaWithAi: num(funil.leadDeEntradaWithAi),
    },
  };
}

export async function fetchAcademicCockpit(): Promise<AcademicCockpit> {
  const res = await fetch(apiUrl("/api/public/agent-cockpit"), {
    cache: "no-store",
    credentials: "include",
  });
  const data = await parseApiResponse<AgentCockpitResponse>(
    res,
    "Não foi possível carregar as métricas do agente.",
  );
  if (!data?.academic) {
    throw new Error(
      "As métricas do agente acadêmico ainda não estão disponíveis nesta API.",
    );
  }
  return normalizeAcademic(data.academic);
}

export type AcademicCasesPage = {
  cases: AcademicCockpitCase[];
  page: number;
  pageSize: number;
  total: number;
};

export async function fetchAcademicCockpitCases(
  key: AcademicCaseKey,
  page = 1,
): Promise<AcademicCasesPage> {
  const res = await fetch(
    apiUrl(
      `/api/public/agent-cockpit/cases?key=${encodeURIComponent(key)}&page=${page}`,
    ),
    { cache: "no-store", credentials: "include" },
  );
  const data = await parseApiResponse<Partial<AcademicCasesPage>>(
    res,
    "Não foi possível carregar os casos.",
  );
  const cases = Array.isArray(data?.cases)
    ? data.cases
        .filter((c) => c && typeof c.conversationId === "string")
        .map((c) => ({
          conversationId: c.conversationId,
          conversationNumber:
            typeof c.conversationNumber === "number" ? c.conversationNumber : null,
          contactName:
            typeof c.contactName === "string" && c.contactName.trim()
              ? c.contactName
              : "Sem nome",
          phone: typeof c.phone === "string" && c.phone.trim() ? c.phone : null,
        }))
    : [];
  return {
    cases,
    page: Number(data?.page) || page,
    pageSize: Number(data?.pageSize) || 50,
    total: Number(data?.total) || 0,
  };
}
