"use client";

/*
 * Estado dos filtros do dashboard sincronizado com a URL query string
 * (legível e compartilhável). Recarregar a página mantém os filtros.
 *
 * Exemplo:
 *   /dashboard?period=last_30&pipeline=12,8&stages=negociacao&user=u1,u2
 *
 * Sem query string → padrão "Últimos 30 dias" + todos os funis (soma).
 * `pipeline` na URL é CSV de numbers da org; `stages` continuam slugs.
 * `user` = filtro de usuário do painel Negócios.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  findPipelineByUrlParam,
  pipelineUrlParam,
} from "@/features/pipeline-v2/hooks/use-pipeline-url-sync";
import {
  readJsonWithFallback,
  scopedKey,
  useDashboardStorageScope,
  writeJson,
} from "@/features/dashboard-v2/dashboard-persist";

import type { DashboardFiltersState, PeriodKey } from "./api";

export const DASHBOARD_FILTERS_KEY_PREFIX = "dashboard-filters";

const VALID_PERIODS: PeriodKey[] = [
  "today",
  "yesterday",
  "last_7",
  "last_30",
  "this_month",
  "last_month",
  "custom",
];

export type DashboardPipelineOption = {
  id: string;
  number?: number;
  slug?: string;
  name?: string;
  stages?: Array<{ id: string; slug?: string }>;
};

function parseCsv(value: string | null): string[] {
  return value
    ? value.split(",").map((s) => s.trim()).filter(Boolean)
    : [];
}

/** Valores crus da URL (number, slug legado ou CUID legado). */
type UrlFilterKeys = {
  period: PeriodKey;
  startDate?: string;
  endDate?: string;
  pipelineKeys: string[];
  stageKeys: string[];
  tagIds: string[];
  ownerIds: string[];
  userIds: string[];
  sources: string[];
};

function readUrlKeys(sp: URLSearchParams): UrlFilterKeys {
  const periodRaw = sp.get("period");
  const period: PeriodKey =
    periodRaw && VALID_PERIODS.includes(periodRaw as PeriodKey)
      ? (periodRaw as PeriodKey)
      : "last_30";
  const pipelineRaw = sp.get("pipeline") ?? sp.get("pipelineId") ?? "";
  return {
    period,
    startDate: sp.get("startDate") ?? undefined,
    endDate: sp.get("endDate") ?? undefined,
    pipelineKeys: parseCsv(pipelineRaw),
    stageKeys: parseCsv(sp.get("stages")),
    tagIds: parseCsv(sp.get("tags")),
    ownerIds: parseCsv(sp.get("owners")),
    userIds: parseCsv(sp.get("user")),
    sources: parseCsv(sp.get("sources")),
  };
}

function resolveToIds(
  keys: UrlFilterKeys,
  pipelines: DashboardPipelineOption[] | undefined,
): DashboardFiltersState {
  const pipelineIds: string[] = [];
  if (keys.pipelineKeys.length && pipelines?.length) {
    for (const key of keys.pipelineKeys) {
      const p = findPipelineByUrlParam(pipelines, key);
      if (p?.id && !pipelineIds.includes(p.id)) pipelineIds.push(p.id);
    }
  } else if (keys.pipelineKeys.length) {
    for (const key of keys.pipelineKeys) {
      if (/^[a-z][a-z0-9]{20,}$/i.test(key) && !pipelineIds.includes(key)) {
        pipelineIds.push(key);
      }
    }
  }

  let stageIds: string[] = [];
  if (pipelineIds.length && pipelines?.length && keys.stageKeys.length) {
    const selected = pipelines.filter((p) => pipelineIds.includes(p.id));
    const stages = selected.flatMap((p) => p.stages ?? []);
    stageIds = keys.stageKeys
      .map(
        (k) =>
          stages.find((s) => s.slug === k)?.id ??
          stages.find((s) => s.id === k)?.id,
      )
      .filter((id): id is string => !!id);
  } else if (keys.pipelineKeys.length && keys.stageKeys.length) {
    stageIds = keys.stageKeys.filter((k) => /^[a-z][a-z0-9]{20,}$/i.test(k));
  }

  return {
    period: keys.period,
    startDate: keys.startDate,
    endDate: keys.endDate,
    pipelineId: pipelineIds[0],
    pipelineIds,
    userIds: keys.userIds,
    stageIds,
    tagIds: keys.tagIds,
    ownerIds: keys.ownerIds,
    sources: keys.sources,
  };
}

function toSearchParams(
  f: DashboardFiltersState,
  pipelines: DashboardPipelineOption[] | undefined,
  current?: URLSearchParams,
): string {
  const sp = new URLSearchParams();
  if (f.period && f.period !== "last_30") sp.set("period", f.period);
  if (f.period === "custom") {
    if (f.startDate) sp.set("startDate", f.startDate);
    if (f.endDate) sp.set("endDate", f.endDate);
  }
  const ids = f.pipelineIds.length
    ? f.pipelineIds
    : f.pipelineId
      ? [f.pipelineId]
      : [];
  if (ids.length) {
    const refs = ids
      .map((id) => pipelineUrlParam(pipelines?.find((x) => x.id === id)))
      .filter((s): s is string => !!s);
    if (refs.length) sp.set("pipeline", refs.join(","));
  }
  if (f.stageIds.length && ids.length) {
    const selected = pipelines?.filter((x) => ids.includes(x.id)) ?? [];
    const stages = selected.flatMap((p) => p.stages ?? []);
    const slugs = f.stageIds
      .map((id) => stages.find((s) => s.id === id)?.slug)
      .filter((s): s is string => !!s);
    if (slugs.length) sp.set("stages", slugs.join(","));
  }
  if (f.tagIds.length) sp.set("tags", f.tagIds.join(","));
  if (f.ownerIds.length) sp.set("owners", f.ownerIds.join(","));
  if (f.userIds.length) sp.set("user", f.userIds.join(","));
  if (f.sources.length) sp.set("sources", f.sources.join(","));
  const mock = current?.get("mock");
  if (mock === "1" || mock === "0") sp.set("mock", mock);
  return sp.toString();
}

/** Conta filtros estruturais (sem período — o calendário do header cuida disso). */
export function countStructuralDashboardFilters(f: DashboardFiltersState): number {
  let n = 0;
  if (f.pipelineIds.length || f.pipelineId) n++;
  if (f.stageIds.length) n++;
  if (f.tagIds.length) n++;
  if (f.ownerIds.length) n++;
  if (f.userIds.length) n++;
  if (f.sources.length) n++;
  return n;
}

/** Conta filtros ativos para o badge "Limpar filtros". */
export function countActiveDashboardFilters(f: DashboardFiltersState): number {
  return countStructuralDashboardFilters(f) + (f.period !== "last_30" ? 1 : 0);
}

export const DEFAULT_DASHBOARD_FILTERS: DashboardFiltersState = {
  period: "last_30",
  pipelineIds: [],
  userIds: [],
  stageIds: [],
  tagIds: [],
  ownerIds: [],
  sources: [],
};

const FILTER_URL_KEYS = [
  "period",
  "startDate",
  "endDate",
  "pipeline",
  "pipelineId",
  "stages",
  "tags",
  "owners",
  "user",
  "sources",
] as const;

function urlHasDashboardFilters(sp: URLSearchParams): boolean {
  return FILTER_URL_KEYS.some((key) => Boolean(sp.get(key)));
}

function isFiltersState(v: unknown): v is DashboardFiltersState {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.period === "string" && Array.isArray(o.pipelineIds ?? []);
}

/** @deprecated use read via hook — mantido para testes/leituras sem resolve. */
export function readDashboardFilters(
  sp: URLSearchParams,
  pipelines?: DashboardPipelineOption[],
): DashboardFiltersState {
  return resolveToIds(readUrlKeys(sp), pipelines);
}

export function useDashboardFilters(
  pipelines?: DashboardPipelineOption[],
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ready, userId, keyPart } = useDashboardStorageScope();
  const restoredRef = useRef(false);

  const urlFilters = useMemo(
    () =>
      resolveToIds(
        readUrlKeys(new URLSearchParams(searchParams.toString())),
        pipelines,
      ),
    [searchParams, pipelines],
  );

  const [optimistic, setOptimistic] = useState<DashboardFiltersState | null>(null);
  const filters = optimistic ?? urlFilters;

  useEffect(() => {
    function onPop() {
      setOptimistic(null);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!optimistic) return;
    if (
      toSearchParams(optimistic, pipelines, searchParams) ===
      searchParams.toString()
    ) {
      setOptimistic(null);
    }
  }, [optimistic, pipelines, searchParams]);

  useEffect(() => {
    const ids = filters.pipelineIds;
    if (!pipelines?.length || !ids.length) return;
    const refs = ids
      .map((id) => pipelineUrlParam(pipelines.find((x) => x.id === id)))
      .filter((s): s is string => !!s);
    if (!refs.length) return;
    const want = refs.join(",");
    const current = searchParams.get("pipeline");
    const hasLegacyId = searchParams.has("pipelineId");
    if (current === want && !hasLegacyId) return;
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("pipeline", want);
    sp.delete("pipelineId");
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [pipelines, filters.pipelineIds, searchParams, pathname, router]);

  const setFilters = useCallback(
    (next: DashboardFiltersState) => {
      const pipelineIds = next.pipelineIds ?? [];
      const normalized: DashboardFiltersState = {
        ...next,
        pipelineIds,
        pipelineId: pipelineIds[0],
        userIds: next.userIds ?? [],
      };
      setOptimistic(normalized);
      if (keyPart) writeJson(scopedKey(DASHBOARD_FILTERS_KEY_PREFIX, keyPart), normalized);
      const qs = toSearchParams(normalized, pipelines, searchParams);
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (typeof window !== "undefined") {
        window.history.replaceState(window.history.state ?? {}, "", url);
      }
      router.replace(url, { scroll: false });
    },
    [keyPart, pathname, pipelines, router, searchParams],
  );

  useEffect(() => {
    if (!ready || !keyPart || !userId || restoredRef.current) return;
    restoredRef.current = true;
    const sp = new URLSearchParams(searchParams.toString());
    if (urlHasDashboardFilters(sp)) {
      writeJson(scopedKey(DASHBOARD_FILTERS_KEY_PREFIX, keyPart), urlFilters);
      return;
    }
    const saved = readJsonWithFallback<unknown>(
      DASHBOARD_FILTERS_KEY_PREFIX,
      keyPart,
      userId,
    );
    if (!isFiltersState(saved)) return;
    setFilters(saved);
  }, [ready, keyPart, userId, searchParams, urlFilters, setFilters]);

  const patch = useCallback(
    (partial: Partial<DashboardFiltersState>) => {
      const next = { ...filters, ...partial };
      if (partial.pipelineIds) {
        next.pipelineId = partial.pipelineIds[0];
      } else if (partial.pipelineId !== undefined && partial.pipelineIds === undefined) {
        next.pipelineIds = partial.pipelineId ? [partial.pipelineId] : [];
      }
      setFilters(next);
    },
    [filters, setFilters],
  );

  const clear = useCallback(() => {
    setFilters(DEFAULT_DASHBOARD_FILTERS);
  }, [setFilters]);

  return { filters, setFilters, patch, clear };
}

/**
 * Converte os filtros de período num intervalo ISO {from,to} para o
 * tab de Atendimento (que ainda usa o endpoint legado por período).
 * Espelha a lógica do backend (computeRange).
 */
export function periodToRangeISO(f: DashboardFiltersState): {
  from: string;
  to: string;
} {
  if (f.period === "custom" && f.startDate && f.endDate) {
    const from = new Date(`${f.startDate}T00:00:00`);
    const to = new Date(`${f.endDate}T23:59:59.999`);
    if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())) {
      return { from: from.toISOString(), to: to.toISOString() };
    }
  }

  const now = new Date();
  const from = new Date(now);
  const to = new Date(now);

  switch (f.period) {
    case "today":
      from.setHours(0, 0, 0, 0);
      to.setHours(23, 59, 59, 999);
      break;
    case "yesterday":
      from.setDate(from.getDate() - 1);
      from.setHours(0, 0, 0, 0);
      to.setDate(to.getDate() - 1);
      to.setHours(23, 59, 59, 999);
      break;
    case "last_7":
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case "last_30":
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      break;
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      const last = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      return { from: first.toISOString(), to: last.toISOString() };
    }
    case "this_month":
    default:
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      break;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export function todayRangeISO(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}
