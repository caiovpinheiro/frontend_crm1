"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";

function readDealQuery(): string | null {
  if (typeof window === "undefined") return null;
  return new URL(window.location.href).searchParams.get("deal");
}

function writeDealQuery(num: number, mode: "push" | "replace") {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const urlVal = String(num);
  if (url.searchParams.get("deal") === urlVal) return;
  url.searchParams.set("deal", urlVal);
  const fn = mode === "push" ? window.history.pushState : window.history.replaceState;
  fn.call(window.history, window.history.state, "", url.toString());
}

function clearDealQuery() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has("deal")) return;
  url.searchParams.delete("deal");
  window.history.replaceState(window.history.state, "", url.toString());
}

/**
 * Deep-link `?deal=` espelhado do kanban (`_v2-client`), sem alterar aquele arquivo.
 *
 * - Estado interno: CUID (ou dígitos até o detail resolver).
 * - URL: só número sequencial (`?deal=102`). Nunca escreve CUID novo.
 * - Leitura: dígitos ou CUID legado.
 * - History API (push/replace) para não refetch de RSC.
 */
export function useDealDeepLink() {
  const [activeDealId, setActiveDealId] = useState<string | null>(readDealQuery);

  const setActiveDeal = useCallback((id: string | null, num?: number | null) => {
    setActiveDealId(id);
    if (typeof window === "undefined") return;
    if (!id) {
      clearDealQuery();
      return;
    }
    // Sem número conhecido: não escrever CUID na URL — sync depois via syncDealNumber.
    if (num != null) writeDealQuery(num, "push");
  }, []);

  /** Após conhecer o número (board/detail), grava só dígitos na URL. */
  const syncDealNumber = useCallback((num: number | null | undefined) => {
    if (num == null) return;
    writeDealQuery(num, "replace");
  }, []);

  useLayoutEffect(() => {
    const d = readDealQuery();
    if (d) setActiveDealId((cur) => cur ?? d);
  }, []);

  useEffect(() => {
    function onPop() {
      setActiveDealId(new URL(window.location.href).searchParams.get("deal"));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** Após GET /deals/:id por número, troca o estado para o CUID real. */
  const normalizeDealId = useCallback((resolvedId: string | null | undefined) => {
    if (!resolvedId || !activeDealId) return;
    if (/^\d+$/.test(activeDealId) && resolvedId !== activeDealId) {
      setActiveDealId(resolvedId);
    }
  }, [activeDealId]);

  return {
    activeDealId,
    setActiveDeal,
    normalizeDealId,
    syncDealNumber,
    /** Valor cru da URL no mount (número ou cuid) — útil como hint. */
    dealNumberHint: typeof window !== "undefined"
      ? new URL(window.location.href).searchParams.get("deal")
      : null,
  };
}
