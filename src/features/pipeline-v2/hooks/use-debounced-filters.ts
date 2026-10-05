"use client";

import { useEffect, useMemo, useState } from "react";

import { canonicalFiltersKey } from "@/components/pipeline/kanban-filters/canonical";
import {
  hasServerSideFilters,
  type AdvancedDealFilters,
} from "@/components/pipeline/kanban-filters/types";

/** Espera depois da última alteração de filtro antes de pedir o board. */
export const BOARD_FILTERS_DEBOUNCE_MS = 350;

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
 */
export function useDebouncedFilters(
  filters: AdvancedDealFilters,
  delayMs: number = BOARD_FILTERS_DEBOUNCE_MS,
): { filters: AdvancedDealFilters; pending: boolean } {
  const key = canonicalFiltersKey(filters);
  const [appliedKey, setAppliedKey] = useState(key);
  const immediate =
    key !== appliedKey && !hasServerSideFilters(JSON.parse(key) as AdvancedDealFilters);
  // Ajuste de estado durante o render (o React refaz o render com o valor
  // novo): limpar os filtros não espera o debounce.
  if (immediate) setAppliedKey(key);

  useEffect(() => {
    if (key === appliedKey || immediate) return;
    const timer = setTimeout(() => setAppliedKey(key), delayMs);
    return () => clearTimeout(timer);
  }, [key, appliedKey, immediate, delayMs]);

  const currentKey = immediate ? key : appliedKey;
  const applied = useMemo(
    () => JSON.parse(currentKey) as AdvancedDealFilters,
    [currentKey],
  );
  return { filters: applied, pending: key !== currentKey };
}
