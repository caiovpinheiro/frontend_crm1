/**
 * Busca (`?q=`) e ordenação (`?sort=`) do Pipeline na URL.
 *
 * Antes viviam só em localStorage, então o link copiado da barra de endereço
 * não reproduzia o que a pessoa estava vendo. Agora a URL é a fonte da verdade
 * e o localStorage só é reaplicado em navegação interna (voltar de outra
 * tela do app), nunca sobre uma abertura fria com URL limpa. A busca grava e
 * apaga a chave junto com a URL; a ordenação é preferência de visualização e
 * continua valendo sempre.
 *
 * Escrita sempre com `replaceState`: digitar não deve empilhar uma entrada de
 * histórico por caractere, e ordenação é preferência de visualização (o botão
 * Voltar continua servindo para desfazer FILTRO, que usa `pushState`).
 */

"use client";

import * as React from "react";

import { isInternalFunnelEntry } from "@/lib/pipeline-entry-navigation";
import { applyUrlParams, readLiveParams, useUrlPopstate } from "@/lib/url-state";

import type { PipelineSortKey } from "./v2/variant-modal-three-col";

export const SEARCH_URL_PARAM = "q";
export const SORT_URL_PARAM = "sort";

const PIPELINE_SEARCH_LS = "kanban-pipeline-search:v1";
const PIPELINE_SORT_LS = "kanban-pipeline-sort:v1";

const SORT_KEYS: readonly PipelineSortKey[] = [
  "default",
  "interaction_newest",
  "interaction_oldest",
  "name_az",
  "name_za",
  "created_newest",
  "created_oldest",
];

function isSortKey(raw: string | null | undefined): raw is PipelineSortKey {
  return !!raw && (SORT_KEYS as readonly string[]).includes(raw);
}

function initialSearch(): string {
  if (typeof window === "undefined") return "";
  const fromUrl = readLiveParams().get(SEARCH_URL_PARAM);
  if (fromUrl != null) return fromUrl;
  // Abertura fria com URL limpa = busca vazia; o salvo só volta em navegação
  // interna (ver `pipeline-entry-navigation`).
  if (!isInternalFunnelEntry()) return "";
  try {
    return localStorage.getItem(PIPELINE_SEARCH_LS) ?? "";
  } catch {
    return "";
  }
}

function initialSort(): PipelineSortKey {
  if (typeof window === "undefined") return "default";
  const fromUrl = readLiveParams().get(SORT_URL_PARAM);
  if (isSortKey(fromUrl)) return fromUrl;
  try {
    const raw = localStorage.getItem(PIPELINE_SORT_LS);
    if (isSortKey(raw)) return raw;
  } catch {
    /* noop */
  }
  return "default";
}

export type UsePipelineSearchSortResult = {
  search: string;
  setSearch: (next: string) => void;
  sortKey: PipelineSortKey;
  setSortKey: (next: PipelineSortKey) => void;
};

export function usePipelineSearchSort(): UsePipelineSearchSortResult {
  const [search, setSearch] = React.useState<string>(initialSearch);
  const [sortKey, setSortKey] = React.useState<PipelineSortKey>(initialSort);

  React.useEffect(() => {
    applyUrlParams({ [SEARCH_URL_PARAM]: search.trim() || null }, "replace");
    try {
      // Espelha a URL: busca vazia apaga a chave (não deixa resíduo).
      if (search.trim()) localStorage.setItem(PIPELINE_SEARCH_LS, search);
      else localStorage.removeItem(PIPELINE_SEARCH_LS);
    } catch {
      /* noop */
    }
  }, [search]);

  React.useEffect(() => {
    applyUrlParams(
      { [SORT_URL_PARAM]: sortKey === "default" ? null : sortKey },
      "replace",
    );
    try {
      localStorage.setItem(PIPELINE_SORT_LS, sortKey);
    } catch {
      /* noop */
    }
  }, [sortKey]);

  const onPop = React.useCallback(() => {
    const params = readLiveParams();
    setSearch(params.get(SEARCH_URL_PARAM) ?? "");
    const sort = params.get(SORT_URL_PARAM);
    setSortKey(isSortKey(sort) ? sort : "default");
  }, []);
  useUrlPopstate(onPop);

  return { search, setSearch, sortKey, setSortKey };
}
