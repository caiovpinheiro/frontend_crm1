/*
 * Fixtures do Painel (`/dashboard?mock=1`). Mesmo contrato das APIs
 * /api/painel/deals e /api/painel/service — sem Postgres.
 *
 * 7d vs 30d muda KPIs/volume de Negócios e o volume de Atendimentos.
 * Agora, valor em aberto e exceções são estado presente (não mudam).
 */

import type { FilterOptionsResponse } from "@/components/pipeline/kanban-filters/types";
import type { SystemUsageSummaryResponse } from "@/features/system-usage/types";

import type { DashboardFiltersState } from "./api";
import type {
  PainelAgora,
  PainelAgentRow,
  PainelByDepartment,
  PainelConnections,
  PainelCustomFieldCard,
  PainelDealsResult,
  PainelEventCard,
  PainelEvolution,
  PainelFunnelStage,
  PainelFunnelUserRow,
  PainelHeatmap,
  PainelServiceResult,
  PainelSourceRow,
  PainelVolume,
} from "./painel-api";

const FUNNEL_TOOLTIP =
  "Coorte: dos negócios que entraram nesta etapa no período, quantos chegaram na seguinte. Não é o estoque de hoje.";

const ATTENDANT_ATTRIBUTION =
  "Conta para os dois: cada conversa entra na carga de todo atendente que a recebeu (atribuição atual + distribuição). Não é só quem finalizou.";

const STAGES: { id: string; name: string; color: string }[] = [
  { id: "mock-st-novo", name: "Novo", color: "var(--brand-primary)" },
  { id: "mock-st-qualificado", name: "Qualificado", color: "var(--brand-secondary)" },
  { id: "mock-st-proposta", name: "Proposta", color: "var(--color-lead)" },
  { id: "mock-st-negociacao", name: "Negociação", color: "var(--color-warning)" },
  { id: "mock-st-fechamento", name: "Fechamento", color: "var(--color-success)" },
];

export const MOCK_FUNNEL_STAGE_IDS = STAGES.map((s) => s.id);

export const MOCK_PIPELINES = [
  { id: "mock-pl-vendas", number: 1, name: "Vendas", slug: "vendas", scale: 1 },
  { id: "mock-pl-b2b", number: 2, name: "B2B", slug: "b2b", scale: 0.65 },
  { id: "mock-pl-licenciado", number: 3, name: "Licenciado", slug: "licenciado", scale: 0.4 },
] as const;

const MOCK_USERS = [
  { id: "mock-ag-ana", name: "Ana Souza" },
  { id: "mock-ag-bruno", name: "Bruno Lima" },
  { id: "mock-ag-carla", name: "Carla Mendes" },
  { id: "mock-ag-diego", name: "Diego Alves" },
  { id: "mock-ag-elena", name: "Elena Costa" },
  { id: "mock-ag-fernanda", name: "Fernanda Dias" },
  { id: "mock-ag-gabriela", name: "Gabriela Nunes" },
  { id: "mock-ag-hugo", name: "Hugo Martins" },
  { id: "mock-ag-iris", name: "Iris Prado" },
  { id: "mock-ag-joao", name: "João Ribeiro" },
  { id: "mock-ag-karina", name: "Karina Lopes" },
  { id: "mock-ag-lucas", name: "Lucas Teixeira" },
];

function selectedScale(filters: DashboardFiltersState): number {
  const ids = filters.pipelineIds?.length
    ? filters.pipelineIds
    : filters.pipelineId
      ? [filters.pipelineId]
      : [];
  if (!ids.length) {
    return MOCK_PIPELINES.reduce((s, p) => s + p.scale, 0);
  }
  return ids.reduce((s, id) => {
    const p = MOCK_PIPELINES.find((x) => x.id === id);
    return s + (p?.scale ?? 1);
  }, 0);
}

function zonedToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}

function weekdayMon0(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return (js + 6) % 7;
}

function periodWindow(filters: DashboardFiltersState): {
  from: string;
  to: string;
  includesToday: boolean;
} {
  const today = zonedToday();
  switch (filters.period) {
    case "today":
      return { from: today, to: today, includesToday: true };
    case "yesterday": {
      const y = addDaysYmd(today, -1);
      return { from: y, to: y, includesToday: false };
    }
    case "last_7":
      return { from: addDaysYmd(today, -6), to: today, includesToday: true };
    case "this_month":
      return { from: `${today.slice(0, 8)}01`, to: today, includesToday: true };
    case "last_month": {
      const firstThis = `${today.slice(0, 8)}01`;
      const lastPrev = addDaysYmd(firstThis, -1);
      return {
        from: `${lastPrev.slice(0, 8)}01`,
        to: lastPrev,
        includesToday: false,
      };
    }
    case "custom":
      if (filters.startDate && filters.endDate) {
        return {
          from: filters.startDate,
          to: filters.endDate,
          includesToday: filters.endDate >= today,
        };
      }
      break;
    default:
      break;
  }
  return { from: addDaysYmd(today, -29), to: today, includesToday: true };
}

function eachDay(from: string, to: string): string[] {
  const keys: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 400) {
    keys.push(cur);
    cur = addDaysYmd(cur, 1);
    guard++;
  }
  return keys;
}

type PeriodBand = "d30" | "d7" | "d1" | "month";

function bandFor(days: number, period: DashboardFiltersState["period"]): PeriodBand {
  if (period === "last_7") return "d7";
  if (period === "today" || period === "yesterday" || days <= 2) return "d1";
  if (period === "last_30" || days >= 20) return "d30";
  if (days <= 9) return "d7";
  return "month";
}

function kpi(
  key: string,
  value: number | null,
  delta: number,
  extra?: { asOf?: "hoje"; hideDelta?: boolean },
) {
  return {
    key,
    value,
    prevRecords: extra?.hideDelta ? 0 : 18,
    delta: { value: extra?.hideDelta ? 0 : delta, hidden: extra?.hideDelta ?? false },
    asOf: extra?.asOf,
  };
}

function ok<T>(data: T) {
  return { ok: true as const, data };
}

function dealKpis(band: PeriodBand): PainelDealsResult["kpis"] {
  const openToday = 428_500;
  if (band === "d7") {
    const receita = 61_200;
    const ganhos = 8;
    return ok({
      receitaGanha: kpi("receitaGanha", receita, 18.6),
      negociosGanhos: kpi("negociosGanhos", ganhos, 14.3),
      ticketMedio: kpi("ticketMedio", Math.round(receita / ganhos), 3.8),
      taxaConversao: kpi("taxaConversao", 61.5, 6.2),
      valorEmAberto: kpi("valorEmAberto", openToday, 0, { asOf: "hoje", hideDelta: true }),
      hasClosedInPeriod: true,
    });
  }
  if (band === "d1") {
    const receita = 8_900;
    const ganhos = 2;
    return ok({
      receitaGanha: kpi("receitaGanha", receita, 22.0),
      negociosGanhos: kpi("negociosGanhos", ganhos, 100),
      ticketMedio: kpi("ticketMedio", Math.round(receita / ganhos), 4.1),
      taxaConversao: kpi("taxaConversao", 66.7, 8.4),
      valorEmAberto: kpi("valorEmAberto", openToday, 0, { asOf: "hoje", hideDelta: true }),
      hasClosedInPeriod: true,
    });
  }
  const receita = band === "month" ? 172_800 : 186_400;
  const ganhos = band === "month" ? 21 : 23;
  return ok({
    receitaGanha: kpi("receitaGanha", receita, 12.4),
    negociosGanhos: kpi("negociosGanhos", ganhos, 8.7),
    ticketMedio: kpi("ticketMedio", Math.round(receita / ganhos), 3.4),
    taxaConversao: kpi("taxaConversao", 62.2, 5.1),
    valorEmAberto: kpi("valorEmAberto", openToday, 0, { asOf: "hoje", hideDelta: true }),
    hasClosedInPeriod: true,
  });
}

function funnelUserRows(
  count: number,
  value: number,
  todayDelta: number,
): PainelFunnelUserRow[] {
  const weights = [0.22, 0.18, 0.14, 0.12, 0.1, 0.08, 0.06, 0.04, 0.03, 0.03];
  return MOCK_USERS.slice(0, 10).map((u, i) => {
    const w = weights[i] ?? 0.02;
    const c = Math.max(i < 3 ? 1 : 0, Math.round(count * w));
    const d = i < todayDelta ? (i % 3 === 0 ? -1 : 1) : 0;
    return {
      id: u.id,
      name: u.name,
      count: c,
      value: Math.round(value * w),
      todayDelta: c > 0 ? d : 0,
    };
  }).filter((r) => r.count > 0);
}

function funnelStages(band: PeriodBand, scale: number): PainelFunnelStage[] {
  const rows =
    band === "d7"
      ? [
          [14, 118_000, 64.3, 3, 1],
          [9, 86_400, 66.7, 2, 1],
          [6, 64_200, 66.7, 1, 0],
          [4, 48_800, 75, 1, 0],
          [3, 39_100, null, 0, 0],
        ]
      : band === "d1"
        ? [
            [4, 32_000, 75, 4, 0],
            [3, 27_400, 66.7, 2, 0],
            [2, 19_800, 50, 1, 0],
            [1, 12_400, 100, 1, 0],
            [1, 8_900, null, 0, 0],
          ]
        : [
            [48, 412_000, 62.5, 6, 3],
            [30, 298_000, 70, 4, 2],
            [21, 241_000, 57.1, 3, 1],
            [12, 168_000, 75, 2, 1],
            [9, 142_000, null, 1, 0],
          ];
  return STAGES.map((s, i) => {
    const count = Math.max(1, Math.round((rows[i]![0] as number) * scale));
    const value = Math.round((rows[i]![1] as number) * scale);
    const todayDelta = Math.round((rows[i]![3] as number) * scale);
    const lost = Math.round((rows[i]![4] as number) * scale);
    return {
      ...s,
      count,
      value,
      passThrough: rows[i]![2] as number | null,
      entered: count,
      lost,
      todayDelta,
      byUser: funnelUserRows(count, value, todayDelta),
    };
  });
}

function evolution(dates: string[], includesToday: boolean): PainelEvolution {
  const points = dates.map((date, i, arr) => {
    const weekend = weekdayMon0(date) >= 5;
    const incomplete = includesToday && i === arr.length - 1;
    const fade = incomplete ? 0.72 : 1;
    const wf = weekend ? 0.82 : 1;
    const wave = 1 + 0.12 * Math.sin((i / Math.max(1, arr.length - 1)) * Math.PI);
    return {
      date,
      incomplete,
      byStage: {
        "mock-st-novo": Math.round((16 + (i % 5)) * fade * wf * wave),
        "mock-st-qualificado": Math.round((11 + (i % 4)) * fade * wf),
        "mock-st-proposta": Math.round((8 + (i % 3)) * fade * wf),
        "mock-st-negociacao": Math.round((5 + (i % 2)) * fade * wf),
        "mock-st-fechamento": Math.round((3 + (i % 2)) * fade * wf),
      },
    };
  });
  return {
    available: true,
    retentionDays: 400,
    retainedFrom: dates[0] ?? null,
    incompleteLast: includesToday,
    useBars: dates.length <= 7,
    stages: STAGES,
    points,
  };
}

function agents(band: PeriodBand): PainelAgentRow[] {
  const scale = band === "d7" ? 0.35 : band === "d1" ? 0.12 : 1;
  const rows: Omit<PainelAgentRow, "ticket">[] = [
    { id: "mock-ag-ana", name: "Ana Souza", wonValue: 78_400, wonCount: 8, conversion: 72.7, openToday: 6, zeroActivity: false },
    { id: "mock-ag-bruno", name: "Bruno Lima", wonValue: 51_200, wonCount: 6, conversion: 66.7, openToday: 4, zeroActivity: false },
    { id: "mock-ag-carla", name: "Carla Mendes", wonValue: 34_800, wonCount: 5, conversion: 55.6, openToday: 5, zeroActivity: false },
    { id: "mock-ag-diego", name: "Diego Alves", wonValue: 22_000, wonCount: 4, conversion: 50, openToday: 3, zeroActivity: false },
    { id: "mock-ag-elena", name: "Elena Costa", wonValue: 0, wonCount: 0, conversion: null, openToday: 0, zeroActivity: true },
  ];
  return rows.map((r) => {
    if (r.zeroActivity) {
      return { ...r, ticket: null };
    }
    const wonCount = Math.max(1, Math.round(r.wonCount * scale));
    const wonValue = Math.round(r.wonValue * scale);
    return {
      ...r,
      wonValue,
      wonCount,
      ticket: Math.round(wonValue / wonCount),
    };
  });
}

function sources(band: PeriodBand): PainelSourceRow[] {
  const scale = band === "d7" ? 0.34 : band === "d1" ? 0.11 : 1;
  const raw: PainelSourceRow[] = [
    { key: "whatsapp", label: "WhatsApp", wonCount: 7, wonValue: 58_400 },
    { key: "instagram", label: "Instagram", wonCount: 4, wonValue: 32_100 },
    { key: "indicacao", label: "Indicação", wonCount: 3, wonValue: 28_800 },
    { key: "google", label: "Google Ads", wonCount: 3, wonValue: 21_600 },
    { key: "site", label: "Site", wonCount: 2, wonValue: 16_200 },
    { key: "linkedin", label: "LinkedIn", wonCount: 1, wonValue: 9_800 },
    { key: "evento", label: "Evento", wonCount: 1, wonValue: 8_400 },
    { key: "email", label: "E-mail", wonCount: 1, wonValue: 6_200 },
    { key: "__outras__", label: "Outras", wonCount: 1, wonValue: 4_900 },
  ];
  return raw.map((r) => ({
    ...r,
    wonCount: Math.max(1, Math.round(r.wonCount * scale)),
    wonValue: Math.round(r.wonValue * scale),
  }));
}

function dealExceptions(): PainelDealsResult["exceptions"] {
  return ok([
    { key: "no_task", count: 14, href: "/pipeline/list?status=OPEN&exception=no_task" },
    {
      key: "stalled",
      count: 9,
      href: "/pipeline/list?status=OPEN&exception=stalled&stalledDays=7",
      stalledDays: 7,
    },
    { key: "overdue", count: 6, href: "/pipeline/list?status=OPEN&exception=overdue" },
    { key: "empty_value", count: 4, href: "/pipeline/list?status=OPEN&exception=empty_value" },
  ]);
}

function scaleKpis(block: PainelDealsResult["kpis"], scale: number): PainelDealsResult["kpis"] {
  if (!block.ok) return block;
  const k = block.data;
  const mul = (n: number | null) => (n == null ? null : Math.round(n * scale));
  return ok({
    ...k,
    receitaGanha: { ...k.receitaGanha, value: mul(k.receitaGanha.value) },
    negociosGanhos: { ...k.negociosGanhos, value: mul(k.negociosGanhos.value) },
    ticketMedio: k.ticketMedio,
    valorEmAberto: { ...k.valorEmAberto, value: mul(k.valorEmAberto.value) },
  });
}

export function mockPainelDeals(
  filters: DashboardFiltersState,
  fieldIds?: string[],
): PainelDealsResult {
  const win = periodWindow(filters);
  const dates = eachDay(win.from, win.to);
  const band = bandFor(dates.length, filters.period);
  const scale = selectedScale(filters);
  const stages = funnelStages(band, scale);
  const novosCount = Math.max(1, Math.round(stages[0]!.count * 0.55));
  return {
    kpis: scaleKpis(dealKpis(band), scale),
    funnel: ok({
      definition: "cohort",
      tooltip: FUNNEL_TOOLTIP,
      stages,
      empty: false,
      novos: {
        count: novosCount,
        value: Math.round(stages[0]!.value * 0.55),
      },
    }),
    evolution: ok(evolution(dates, win.includesToday)),
    agents: ok(agents(band)),
    sources: ok(sources(band)),
    exceptions: dealExceptions(),
    customFields: ok(mockCustomFieldCards(fieldIds, scale)),
  };
}

function mockCustomFieldCards(fieldIds: string[] | undefined, scale: number): PainelCustomFieldCard[] {
  const catalog = mockFilterOptions().dealCustomFields;
  const ids = fieldIds?.length ? fieldIds : catalog.map((f) => f.id);
  return catalog
    .filter((f) => ids.includes(f.id))
    .map((f, i) => {
      const count = Math.max(2, Math.round((18 - i * 4) * scale));
      const numeric = f.type === "NUMBER";
      const sum = numeric ? Math.round((42_000 - i * 8_000) * scale) : null;
      return {
        fieldId: f.id,
        label: f.label,
        type: f.type,
        count,
        sum,
        byUser: MOCK_USERS.slice(0, 8).map((u, ui) => ({
          id: u.id,
          name: u.name,
          count: Math.max(0, Math.round(count * (0.22 - ui * 0.02))),
          sum: numeric ? Math.round((sum ?? 0) * (0.22 - ui * 0.02)) : null,
        })).filter((r) => r.count > 0),
      };
    });
}

export function mockSystemUsageToday(): SystemUsageSummaryResponse {
  const max = 15 * 3600 + 20 * 60;
  return {
    items: MOCK_USERS.map((u, i) => {
      const total = Math.round(max * (1 - i * 0.07));
      return {
        userId: u.id,
        userName: u.name,
        userEmail: `${u.name.split(" ")[0]!.toLowerCase()}@demo.local`,
        avatarUrl: null,
        activeNow: i < 4,
        lastActivityAt: new Date().toISOString(),
        totalSeconds: Math.max(12 * 60, total),
        sessionCount: 3 + ((8 - i) % 4),
        averageSessionSeconds: Math.round(Math.max(12 * 60, total) / 3),
        interactionCount: 40 + i * 6,
      };
    }),
  };
}

export function mockEventCard(eventType: string, scale = 1): PainelEventCard {
  const presets: Record<string, { title: string; value: number; unit: PainelEventCard["unit"]; href: string }> = {
    messages_in: {
      title: "Mensagens recebidas",
      value: 4317,
      unit: "count",
      href: "/logs?type=MESSAGE_RECEIVED",
    },
    messages_out: {
      title: "Mensagens respondidas",
      value: 3890,
      unit: "count",
      href: "/logs?type=MESSAGE_SENT",
    },
    avg_response: {
      title: "Tempo médio de resposta",
      value: 8 * 60_000,
      unit: "duration",
      href: "/inbox",
    },
    queue: {
      title: "Quantidade por fila",
      value: 34,
      unit: "count",
      href: "/inbox?tab=entrada",
    },
    MESSAGE_RECEIVED: {
      title: "Mensagens recebidas",
      value: 4317,
      unit: "count",
      href: "/logs?type=MESSAGE_RECEIVED",
    },
    MESSAGE_SENT: {
      title: "Mensagens enviadas",
      value: 2140,
      unit: "count",
      href: "/logs?type=MESSAGE_SENT",
    },
  };
  const meta = presets[eventType] ?? {
    title: eventType,
    value: 128,
    unit: "count" as const,
    href: `/logs?type=${encodeURIComponent(eventType)}`,
  };
  const value = meta.unit === "duration" ? meta.value : Math.max(1, Math.round(meta.value * scale));
  return {
    eventType,
    title: meta.title,
    value,
    unit: meta.unit,
    href: meta.href,
    byUser: MOCK_USERS.map((u, i) => ({
      id: u.id,
      name: u.name,
      value: meta.unit === "duration"
        ? Math.round(value * (1 - i * 0.05))
        : Math.max(0, Math.round(value * (0.2 - i * 0.014))),
    })).filter((r) => r.value > 0),
  };
}

export function mockFilterOptions(): FilterOptionsResponse {
  return {
    pipelines: MOCK_PIPELINES.map((p) => ({
      id: p.id,
      name: p.name,
      number: p.number,
      slug: p.slug,
      stages: STAGES.map((s, i) => ({
        id: s.id,
        name: s.name,
        slug: s.id.replace("mock-st-", ""),
        color: s.color,
        position: i,
      })),
    })),
    users: MOCK_USERS.map((u, i) => ({
      id: u.id,
      name: u.name,
      avatarUrl: null,
      role: i < 2 ? "MANAGER" : "AGENT",
      type: "HUMAN",
    })),
    tags: [
      { id: "mock-tag-quente", name: "Quente", color: "var(--color-warning)" },
      { id: "mock-tag-matricula", name: "Matrícula", color: "var(--brand-primary)" },
    ],
    dealCustomFields: [
      {
        id: "mock-cf-ticket",
        name: "ticket_interno",
        label: "Ticket interno",
        type: "NUMBER",
        options: [],
        entity: "deal",
      },
      {
        id: "mock-cf-turma",
        name: "turma",
        label: "Turma",
        type: "SELECT",
        options: ["Manhã", "Noite"],
        entity: "deal",
      },
    ],
    contactCustomFields: [],
    sources: ["WhatsApp", "Instagram", "Site"],
    lossReasons: ["Preço", "Sumiu"],
  };
}

export function mockPainelAgora(clock: "business" | "elapsed"): PainelAgora {
  const overSlaMs = clock === "elapsed" ? 18 * 3_600_000 + 40 * 60_000 : 2 * 3_600_000 + 14 * 60_000;
  return {
    asOf: new Date().toISOString(),
    awaitingReply: 11,
    inService: 18,
    longestWait: {
      ms: overSlaMs,
      contactName: "Mariana Pires",
      agentName: "Ana Souza",
      conversationId: "mock-conv-espera",
      overSla: true,
      slaMinutes: 60,
    },
    agents: { online: 6, total: 9 },
  };
}

function volumeBlock(dates: string[], includesToday: boolean, band: PeriodBand): PainelVolume {
  const byDay = dates.map((date, i, arr) => {
    const weekend = weekdayMon0(date) >= 5;
    const wave = 1 + 0.16 * Math.sin((i / Math.max(1, arr.length - 1)) * Math.PI * 2);
    const base = band === "d1" ? 9 : weekend ? 4 : 8;
    let started = Math.max(1, Math.round(base * wave));
    let finished = weekend ? started : Math.max(0, started - (1 + (i % 3 === 0 ? 1 : 0)));
    const incomplete = includesToday && i === arr.length - 1;
    if (incomplete) {
      started = Math.max(1, Math.round(started * 0.42));
      finished = Math.max(0, Math.round(finished * 0.28));
    }
    return { date, started, finished, incomplete };
  });
  const startedSum = byDay.reduce((s, d) => s + d.started, 0);
  const finishedSum = byDay.reduce((s, d) => s + d.finished, 0);
  const stillOpen = band === "d7" ? 18 : band === "d1" ? 18 : 34;
  const openStarted = band === "d7" ? 11 : band === "d1" ? 12 : 21;
  const openWaiting = stillOpen - openStarted;
  const msgScale = band === "d7" ? 0.32 : band === "d1" ? 0.06 : 1;
  return {
    started: {
      value: startedSum,
      delta: { value: band === "d7" ? 11.2 : 9.4, hidden: false },
    },
    finished: {
      value: finishedSum,
      delta: { value: band === "d7" ? 4.8 : 4.2, hidden: false },
    },
    stillOpen: {
      value: stillOpen,
      delta: { value: 22.1, hidden: false },
    },
    openStarted: {
      value: openStarted,
      delta: { value: band === "d7" ? 8.1 : 6.4, hidden: false },
    },
    openWaiting: {
      value: openWaiting,
      delta: { value: band === "d7" ? 14.2 : 11.8, hidden: false },
    },
    messagesIn: Math.round(2_140 * msgScale),
    messagesOut: Math.round(1_890 * msgScale),
    byDay,
    empty: false,
  };
}

const MOCK_DEPTS = [
  { key: "atendimento", label: "Atendimento", color: "var(--color-primary)" },
  { key: "acolhimento", label: "Acolhimento", color: "var(--color-success)" },
  { key: "retencao", label: "Retenção", color: "var(--color-destructive)" },
  { key: "__none__", label: "Sem departamento", color: "var(--color-primary-dark)" },
] as const;

function tempoBlock(
  dates: string[],
  includesToday: boolean,
  clock: "business" | "elapsed",
  band: PeriodBand,
): PainelServiceResult["tempo"] {
  const mul = clock === "elapsed" ? 2.6 : 1;
  const sampleScale = band === "d7" ? 0.34 : band === "d1" ? 0.08 : 1;
  const dayMs = (baseMin: number, i: number, arrLen: number, weekend: boolean) => {
    const wave = 1 + 0.22 * Math.sin((i / Math.max(1, arrLen - 1)) * Math.PI);
    const w = weekend ? 1.45 : 1;
    return Math.round(baseMin * 60_000 * mul * wave * w);
  };
  return ok({
    clock,
    firstResponse: {
      medianMs: Math.round(8 * 60_000 * mul),
      meanMs: Math.round(14 * 60_000 * mul),
      sample: Math.max(8, Math.round(142 * sampleScale)),
    },
    subsequent: {
      medianMs: Math.round(4 * 60_000 * mul),
      meanMs: Math.round(7 * 60_000 * mul),
      sample: Math.max(12, Math.round(318 * sampleScale)),
    },
    untilClose: {
      medianMs: Math.round(5 * 3_600_000 * mul),
      meanMs: Math.round(9 * 3_600_000 * mul),
      sample: Math.max(6, Math.round(96 * sampleScale)),
    },
    timeToStart: {
      medianMs: Math.round(3 * 60_000 * mul),
      meanMs: Math.round(6 * 60_000 * mul),
      sample: Math.max(8, Math.round(128 * sampleScale)),
    },
    responseByDay: dates.map((date, i, arr) => ({
      date,
      ms: dayMs(9, i, arr.length, weekdayMon0(date) >= 5),
      incomplete: includesToday && i === arr.length - 1,
    })),
    startByDay: dates.map((date, i, arr) => ({
      date,
      ms: dayMs(4, i, arr.length, weekdayMon0(date) >= 5),
      incomplete: includesToday && i === arr.length - 1,
    })),
    empty: false,
  });
}

function heatmap(band: PeriodBand): PainelHeatmap {
  const intensity = band === "d7" ? 0.42 : band === "d1" ? 0.18 : 1;
  const peaks = [11, 9, 16, 13];
  const series = MOCK_DEPTS.map((d, di) => {
    const cells: { x: number; y: number; value: number }[] = [];
    for (let y = 0; y < 7; y++) {
      const weekend = y === 0 || y === 6;
      for (let x = 8; x <= 20; x++) {
        const peak = Math.exp(-((x - peaks[di]!) ** 2) / 16);
        const share = [0.42, 0.28, 0.18, 0.12][di]!;
        const value = Math.round(
          peak * 18 * intensity * share * (weekend ? 0.22 : 1) * (y === 2 ? 1.12 : 1),
        );
        if (value > 0) cells.push({ x, y, value });
      }
    }
    return { key: d.key, label: d.label, color: d.color, cells };
  });
  const total = new Map<string, number>();
  for (const s of series) {
    for (const c of s.cells) {
      const k = `${c.x}-${c.y}`;
      total.set(k, (total.get(k) ?? 0) + c.value);
    }
  }
  const cells = [...total.entries()].map(([k, value]) => {
    const [x, y] = k.split("-").map(Number);
    return { x, y, value };
  });
  return {
    cells,
    series,
    xLabels: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")),
    yLabels: ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"],
    empty: false,
  };
}

function byDepartment(
  dates: string[],
  includesToday: boolean,
  band: PeriodBand,
  clock: "business" | "elapsed",
): PainelByDepartment {
  const scale = band === "d7" ? 0.36 : band === "d1" ? 0.1 : 1;
  const mul = clock === "elapsed" ? 2.4 : 1;
  const shares = [0.42, 0.28, 0.18, 0.12];
  const lookup = new Map<string, number>();
  const started = MOCK_DEPTS.map(() => 0);
  dates.forEach((date, i, arr) => {
    const weekend = weekdayMon0(date) >= 5;
    const wave = 1 + 0.18 * Math.sin((i / Math.max(1, arr.length - 1)) * Math.PI * 2);
    const base = (band === "d1" ? 9 : weekend ? 4 : 8) * wave;
    const fade = includesToday && i === arr.length - 1 ? 0.42 : 1;
    MOCK_DEPTS.forEach((d, di) => {
      const n = Math.max(di === 3 ? 0 : 1, Math.round(base * shares[di]! * fade));
      lookup.set(`${date}::${d.key}`, n);
      started[di] += n;
    });
  });
  const series = MOCK_DEPTS.map((d) => ({ key: d.key, label: d.label, color: d.color }));
  const tableBase = [
    { finished: 86, open: 9, resp: 7, start: 3, service: 4.1 },
    { finished: 54, open: 6, resp: 9, start: 4, service: 5.2 },
    { finished: 31, open: 4, resp: 12, start: 6, service: 6.8 },
    { finished: 11, open: 2, resp: 18, start: 9, service: 8.4 },
  ];
  return {
    series,
    points: dates.map((date, i, arr) => ({
      date,
      incomplete: includesToday && i === arr.length - 1,
      values: Object.fromEntries(MOCK_DEPTS.map((d) => [d.key, lookup.get(`${date}::${d.key}`) ?? 0])),
    })),
    summaries: MOCK_DEPTS.map((d, i) => ({
      key: d.key,
      label: d.label,
      color: d.color,
      started: started[i]!,
    })),
    table: MOCK_DEPTS.map((d, i) => ({
      key: d.key,
      label: d.label,
      started: started[i]!,
      finished: Math.max(1, Math.round(tableBase[i]!.finished * scale)),
      stillOpen: tableBase[i]!.open,
      responseMeanMs: Math.round(tableBase[i]!.resp * 60_000 * mul),
      startMeanMs: Math.round(tableBase[i]!.start * 60_000 * mul),
      serviceMeanMs: Math.round(tableBase[i]!.service * 3_600_000 * mul),
    })),
    empty: false,
    useBars: dates.length <= 7,
  };
}

function connectionsBlock(
  dates: string[],
  includesToday: boolean,
  band: PeriodBand,
): PainelConnections {
  const connSeries = [
    { key: "wa-vendas", label: "WhatsApp Vendas · +55 11 90000-1001", color: "var(--color-success)" },
    { key: "wa-suporte", label: "WhatsApp Suporte · +55 11 90000-1002", color: "var(--color-destructive)" },
    { key: "ig", label: "Instagram principal", color: "var(--color-lead)" },
  ];
  const platSeries = [
    { key: "WHATSAPP", label: "WhatsApp", color: "var(--color-success)" },
    { key: "INSTAGRAM", label: "Instagram", color: "var(--color-lead)" },
    { key: "WEBCHAT", label: "Webchat", color: "var(--color-primary)" },
  ];
  const connShares = [0.48, 0.32, 0.2];
  const platShares = [0.72, 0.2, 0.08];
  const makePoints = (keys: string[], shares: number[]) =>
    dates.map((date, i, arr) => {
      const weekend = weekdayMon0(date) >= 5;
      const wave = 1 + 0.2 * Math.sin((i / Math.max(1, arr.length - 1)) * Math.PI * 2);
      const base = (band === "d1" ? 9 : weekend ? 3 : 7) * wave;
      const fade = includesToday && i === arr.length - 1 ? 0.4 : 1;
      const values: Record<string, number> = {};
      keys.forEach((k, ki) => {
        values[k] = Math.max(0, Math.round(base * shares[ki]! * fade));
      });
      return { date, incomplete: includesToday && i === arr.length - 1, values };
    });
  return {
    connections: {
      series: connSeries,
      points: makePoints(connSeries.map((s) => s.key), connShares),
      empty: false,
    },
    platforms: {
      series: platSeries,
      points: makePoints(platSeries.map((s) => s.key), platShares),
      empty: false,
    },
  };
}

function attendants(band: PeriodBand, clock: "business" | "elapsed"): PainelServiceResult["attendants"] {
  const scale = band === "d7" ? 0.36 : band === "d1" ? 0.1 : 1;
  const mul = clock === "elapsed" ? 2.4 : 1;
  const base = [
    { id: "mock-at-ana", name: "Ana Souza", attended: 48, finished: 41, first: 6, close: 4.2, stillOpen: 5, start: 3 },
    { id: "mock-at-bruno", name: "Bruno Lima", attended: 41, finished: 36, first: 8, close: 5.1, stillOpen: 4, start: 4 },
    { id: "mock-at-carla", name: "Carla Mendes", attended: 33, finished: 27, first: 11, close: 6.4, stillOpen: 6, start: 5 },
    { id: "mock-at-diego", name: "Diego Alves", attended: 22, finished: 18, first: 15, close: 8.0, stillOpen: 3, start: 7 },
    { id: "mock-at-fernanda", name: "Fernanda Dias", attended: 18, finished: 14, first: 9, close: 5.8, stillOpen: 2, start: 4 },
  ];
  return ok({
    rows: base.map((r) => ({
      id: r.id,
      name: r.name,
      attended: Math.max(1, Math.round(r.attended * scale)),
      finished: Math.max(1, Math.round(r.finished * scale)),
      firstResponseMedianMs: Math.round(r.first * 60_000 * mul),
      closeMedianMs: Math.round(r.close * 3_600_000 * mul),
      stillOpen: r.stillOpen,
      responseMeanMs: Math.round(r.first * 1.4 * 60_000 * mul),
      startMeanMs: Math.round(r.start * 60_000 * mul),
      serviceMeanMs: Math.round(r.close * 1.2 * 3_600_000 * mul),
    })),
    attribution: ATTENDANT_ATTRIBUTION,
  });
}

function channels(band: PeriodBand): PainelServiceResult["channels"] {
  const scale = band === "d7" ? 0.34 : band === "d1" ? 0.09 : 1;
  const row = (key: string, label: string, count: number, min: number) => ({
    key,
    label,
    count: Math.max(1, Math.round(count * scale)),
    firstResponseMedianMs: min * 60_000,
  });
  return ok({
    channels: [
      row("whatsapp", "WhatsApp", 128, 7),
      row("instagram", "Instagram", 36, 14),
      row("email", "E-mail", 14, 42),
      row("widget", "Widget do site", 8, 11),
    ],
    motivos: [
      row("matricula", "Matrícula", 52, 6),
      row("financeiro", "Financeiro", 31, 18),
      row("suporte", "Suporte", 24, 9),
      row("comercial", "Comercial", 19, 8),
    ],
  });
}

function serviceExceptions(): PainelServiceResult["exceptions"] {
  return ok([
    { key: "no_reply", count: 8, href: "/inbox?tab=esperando&painel=no_reply" },
    { key: "open_24h", count: 5, href: "/inbox?tab=todos&window=open&painel=open_24h" },
    { key: "unassigned", count: 3, href: "/inbox?tab=entrada&owner=none" },
    { key: "send_failure", count: 2, href: "/inbox?tab=erro" },
  ]);
}

export function mockPainelService(
  filters: DashboardFiltersState,
  clock: "business" | "elapsed",
): PainelServiceResult {
  const win = periodWindow(filters);
  const dates = eachDay(win.from, win.to);
  const band = bandFor(dates.length, filters.period);
  return {
    agora: ok(mockPainelAgora(clock)),
    volume: ok(volumeBlock(dates, win.includesToday, band)),
    tempo: tempoBlock(dates, win.includesToday, clock, band),
    heatmap: ok(heatmap(band)),
    byDepartment: ok(byDepartment(dates, win.includesToday, band, clock)),
    connections: ok(connectionsBlock(dates, win.includesToday, band)),
    attendants: attendants(band, clock),
    channels: channels(band),
    exceptions: serviceExceptions(),
  };
}
