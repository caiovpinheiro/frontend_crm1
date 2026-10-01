/**
 * Hook que centraliza estado dos filtros avançados do Pipeline.
 *
 * A URL é a fonte da verdade e é COMPARTILHÁVEL: cada critério vira um param
 * legível (`?status=OPEN&created=today&owner=...`), estilo Kommo. O
 * localStorage continua como fallback para quem abre `/pipeline` sem query.
 *
 * Prioridade na hidratação:
 *   1. params legíveis (`status`, `created`, …)
 *   2. `?f=<base64>` legado (links antigos / export CSV) → reescrito em params
 *   3. `?filter=<savedFilterId>` → expandido em params
 *   4. localStorage
 *
 * Escrita: History API (`pushState` quando o usuário mexe no filtro — o botão
 * Voltar desfaz; `replaceState` na normalização inicial). Não usamos
 * `router.replace` porque a página é RSC e cada replace refazia o payload do
 * servidor, apagando os deep-links `?pipeline=&stage=&deal=`.
 */

"use client";

import * as React from "react";

import {
  applyUrlParams,
  readLiveParams,
  useUrlPopstate,
} from "@/lib/url-state";

import { fetchSavedFilterById } from "./api";
import { SEARCH_URL_PARAM, SORT_URL_PARAM } from "./use-pipeline-search-sort";
import type { AdvancedDealFilters } from "./types";
import { isEmptyFilters } from "./types";
import {
  DEAL_FILTER_URL_KEYS,
  LEGACY_FILTERS_PARAM,
  SAVED_FILTER_PARAM,
  dealFiltersFromUrlParams,
  dealFiltersToUrlParams,
  hasDealFilterUrlParams,
} from "./url-codec";

const LS_KEY = "kanban-advanced-filters";

/**
 * Serializa filtros para o parâmetro `f` da API (base64url do JSON).
 * Exportado porque a exportação de CSV manda os mesmos filtros para
 * `/api/deals/export?f=…`. A URL do navegador NÃO usa mais esse formato.
 */
export function encodeFiltersParam(filters: AdvancedDealFilters): string {
  return encode(filters);
}

function encode(filters: AdvancedDealFilters): string {
  try {
    const json = JSON.stringify(filters);
    // base64url
    if (typeof window === "undefined") return "";
    const b64 = btoa(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "";
  }
}

function decode(value: string | null | undefined): AdvancedDealFilters | null {
  if (!value) return null;
  try {
    const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const decoded = atob(b64 + pad);
    const json = decodeURIComponent(escape(decoded));
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") return parsed as AdvancedDealFilters;
    return null;
  } catch {
    return null;
  }
}

function readStoredFilters(): AdvancedDealFilters | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const filters = parsed as AdvancedDealFilters;
    return isEmptyFilters(filters) ? null : filters;
  } catch {
    return null;
  }
}

export type UseKanbanFiltersResult = {
  filters: AdvancedDealFilters;
  setFilters: (next: AdvancedDealFilters | ((prev: AdvancedDealFilters) => AdvancedDealFilters)) => void;
  clear: () => void;
  /** Patch parcial — mantém o resto dos critérios. */
  patch: (partial: Partial<AdvancedDealFilters>) => void;
  isEmpty: boolean;
};

export function useKanbanFilters(): UseKanbanFiltersResult {
  const [filters, setFiltersState] = React.useState<AdvancedDealFilters>({});
  // `hydrated` é ESTADO (não ref) de propósito: o efeito de escrita precisa
  // rodar no mesmo commit em que os filtros chegam. Com ref, o efeito passivo
  // do 1º commit rodava com `{}` e apagava da URL os params que acabamos de
  // ler (o F5 perdia o filtro).
  const [hydrated, setHydrated] = React.useState(false);
  const didHydrate = React.useRef(false);
  // `?filter=<id>` é assíncrono: até resolver, não mexemos na URL (senão o
  // efeito de escrita apagaria o param antes do fetch terminar).
  const [resolvingSaved, setResolvingSaved] = React.useState(false);
  // Só ação do usuário empilha histórico; normalização/popstate usa replace.
  const userEdit = React.useRef(false);

  React.useLayoutEffect(() => {
    if (didHydrate.current) return;
    didHydrate.current = true;
    const params = readLiveParams();

    if (hasDealFilterUrlParams(params)) {
      setFiltersState(dealFiltersFromUrlParams(params));
      setHydrated(true);
      return;
    }

    const legacy = decode(params.get(LEGACY_FILTERS_PARAM));
    if (legacy && !isEmptyFilters(legacy)) {
      setFiltersState(legacy);
      setHydrated(true);
      return;
    }

    const savedId = params.get(SAVED_FILTER_PARAM)?.trim();
    if (savedId) {
      setResolvingSaved(true);
      setHydrated(true);
      void fetchSavedFilterById(savedId)
        .then((saved) => {
          const config = saved?.filterConfig;
          if (config && typeof config === "object" && !isEmptyFilters(config)) {
            setFiltersState(config);
          }
        })
        .finally(() => setResolvingSaved(false));
      return;
    }

    // Link compartilhado precisa ser determinístico: se a URL já descreve a
    // visão (busca/ordenação), não misturamos os filtros que ESTE usuário
    // tinha salvos no localStorage.
    const urlDescribesView =
      (params.get(SEARCH_URL_PARAM) ?? "").trim() !== "" ||
      (params.get(SORT_URL_PARAM) ?? "").trim() !== "";
    if (!urlDescribesView) {
      const stored = readStoredFilters();
      if (stored) setFiltersState(stored);
    }
    setHydrated(true);
  }, []);

  // URL + localStorage como SIDE-EFFECT depois do commit (nunca durante o
  // render: `history.pushState` em fase de render dispara warning do Router).
  React.useEffect(() => {
    if (!hydrated || resolvingSaved) return;
    const patchParams: Record<string, string | null> = dealFiltersToUrlParams(filters);
    // Link antigo/atalho já foi expandido nos params legíveis acima.
    patchParams[LEGACY_FILTERS_PARAM] = null;
    patchParams[SAVED_FILTER_PARAM] = null;
    applyUrlParams(patchParams, userEdit.current ? "push" : "replace");
    userEdit.current = false;
    try {
      // "Exibir todas as fases" não é lembrado: cada abertura volta com
      // Ganho/Perdido ocultos (a URL ainda carrega o estado atual).
      const { showAllStages: _all, ...persisted } = filters;
      if (isEmptyFilters(persisted)) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify(persisted));
    } catch {
      /* noop */
    }
  }, [filters, hydrated, resolvingSaved]);

  // Voltar/avançar: a URL manda. Estado volta ao que ela descreve (sem
  // reescrever nada — o efeito acima vira no-op porque a URL já casa).
  const onPop = React.useCallback(() => {
    const params = readLiveParams();
    userEdit.current = false;
    setFiltersState(
      hasDealFilterUrlParams(params) ? dealFiltersFromUrlParams(params) : {},
    );
  }, []);
  useUrlPopstate(onPop);

  const setFilters = React.useCallback<UseKanbanFiltersResult["setFilters"]>(
    (next) => {
      userEdit.current = true;
      setFiltersState((prev) =>
        typeof next === "function" ? next(prev) : next,
      );
    },
    [],
  );

  const patch = React.useCallback(
    (partial: Partial<AdvancedDealFilters>) => {
      setFilters((prev) => ({ ...prev, ...partial }));
    },
    [setFilters],
  );

  const clear = React.useCallback(() => setFilters({}), [setFilters]);

  return {
    filters,
    setFilters,
    patch,
    clear,
    isEmpty: isEmptyFilters(filters),
  };
}

/** Link compartilhável do pipeline com os filtros atuais aplicados. */
export function pipelineFiltersHref(
  pathname: string,
  filters: AdvancedDealFilters,
  extra?: Record<string, string | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({
    ...dealFiltersToUrlParams(filters),
    ...(extra ?? {}),
  })) {
    if (value != null && value !== "") params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Chaves de filtro que vivem na URL (útil para limpar a query). */
export { DEAL_FILTER_URL_KEYS };
