"use client";

import { useMemo, useState } from "react";

import { canonicalFiltersKey } from "@/components/pipeline/kanban-filters/canonical";
import {
  hasServerSideFilters,
  type AdvancedDealFilters,
} from "@/components/pipeline/kanban-filters/types";

import { useDebouncedValue } from "./use-debounced-value";

/** Espera depois da última alteração de filtro antes de pedir o board. */
export const BOARD_FILTERS_DEBOUNCE_MS = 350;

/** Recorte sem critério de servidor: não há POST a economizar. */
function appliesAtOnce(key: string): boolean {
  return !hasServerSideFilters(JSON.parse(key) as AdvancedDealFilters);
}

/**
 * Filtros que o board de fato pede ao servidor: forma canônica
 * (`canonicalFilters`) e só depois de `delayMs` sem novas alterações.
 *
 * Marcar vários critérios em sequência (ou digitar num campo do modal)
 * trocava a chave da query a cada alteração — um POST do board por clique.
 * Aqui a sequência vira um pedido só, com o recorte final. O objeto
 * devolvido mantém a mesma referência enquanto o recorte não muda.
 *
 * Voltar a um recorte sem critério de servidor (limpar filtros) aplica na
 * hora: não há POST a economizar e o board paginado já está em cache.
 *
 * `ready` = o recorte visível já é o de verdade (filtros lidos da URL).
 * Enquanto é `false` — e no render em que vira `true` — o recorte aplicado
 * acompanha o visível na hora: a 1ª query do board já sai com o filtro da
 * URL, em vez de sair sem filtro e ser refeita depois do debounce.
 */
export function useDebouncedFilters(
  filters: AdvancedDealFilters,
  delayMs: number = BOARD_FILTERS_DEBOUNCE_MS,
  options: { ready?: boolean } = {},
): { filters: AdvancedDealFilters; pending: boolean } {
  const ready = options.ready ?? true;
  // "Valor do render anterior" (ajuste de estado durante o render): o render
  // em que `ready` vira `true` ainda aplica na hora.
  const [wasReady, setWasReady] = useState(ready);
  if (wasReady !== ready) setWasReady(ready);
  const settling = !ready || !wasReady;
  const key = canonicalFiltersKey(filters);
  const appliedKey = useDebouncedValue(key, delayMs, {
    immediate: (next) => settling || appliesAtOnce(next),
  });
  const applied = useMemo(
    () => JSON.parse(appliedKey) as AdvancedDealFilters,
    [appliedKey],
  );
  return { filters: applied, pending: key !== appliedKey };
}
