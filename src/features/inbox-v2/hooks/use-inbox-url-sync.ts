"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const C_PARAM = "c";
const LEGACY_PARAMS = ["conversationId", "conversation", "conv"] as const;

export function isInboxConversationNumberParam(
  raw: string | null | undefined,
): boolean {
  if (!raw) return false;
  return /^\d+$/.test(raw.trim());
}

/** Link público da conversa: só o número sequencial, nunca o CUID. */
export function inboxConversationHref(number: number): string {
  return `/inbox?c=${encodeURIComponent(String(number))}`;
}

export function matchesConversationUrlRef(
  row: { id: string; number?: number | null },
  ref: string | null | undefined,
): boolean {
  if (!ref) return false;
  return row.id === ref || (row.number != null && String(row.number) === ref);
}

function readInboxConversationParam(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const c = url.searchParams.get(C_PARAM)?.trim();
  if (c) return c;
  for (const key of LEGACY_PARAMS) {
    const v = url.searchParams.get(key)?.trim();
    if (v) return v;
  }
  return null;
}

function writeInboxConversationParam(
  value: string | null,
  mode: "push" | "replace",
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let dirty = false;
  for (const key of LEGACY_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      dirty = true;
    }
  }
  const cur = url.searchParams.get(C_PARAM);
  if (value == null || value === "") {
    if (url.searchParams.has(C_PARAM)) {
      url.searchParams.delete(C_PARAM);
      dirty = true;
    }
  } else if (cur !== value) {
    url.searchParams.set(C_PARAM, value);
    dirty = true;
  }
  if (!dirty) return;
  const fn =
    mode === "push" ? window.history.pushState : window.history.replaceState;
  fn.call(window.history, window.history.state, "", url.toString());
}

/**
 * Deep-link `?c=` — URL só número sequencial; estado interno continua CUID.
 *
 * Abertura empilha histórico (`pushState`) para o voltar nativo do celular/
 * WebView retornar à lista da Inbox — mesmo padrão de `useDealDeepLink`.
 * Hidratação e sync número (CUID → dígitos) usam `replaceState`.
 */
export function useInboxUrlSync(
  activeId: string | null,
  setActiveId: (id: string | null) => void,
  conversationNumber?: number | null,
  conversationRowId?: string | null,
) {
  const [hydrated, setHydrated] = useState(false);
  /** Evita reescrever a URL após popstate (já refletiu o histórico). */
  const skipWriteRef = useRef(false);
  /** Último valor de `?c=` alinhado com o histórico. */
  const lastWrittenRef = useRef<string | null>(null);

  useEffect(() => {
    const raw = readInboxConversationParam();
    if (raw) {
      lastWrittenRef.current = raw;
      setActiveId(raw);
    }
    setHydrated(true);
  }, [setActiveId]);

  useEffect(() => {
    function onPop() {
      const raw = readInboxConversationParam();
      skipWriteRef.current = true;
      lastWrittenRef.current = raw;
      setActiveId(raw);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setActiveId]);

  useEffect(() => {
    if (!hydrated) return;
    if (skipWriteRef.current) {
      skipWriteRef.current = false;
      return;
    }

    if (!activeId) {
      if (readInboxConversationParam()) {
        writeInboxConversationParam(null, "replace");
      }
      lastWrittenRef.current = null;
      return;
    }

    if (conversationNumber == null || conversationRowId !== activeId) return;

    const numStr = String(conversationNumber);
    const cur = readInboxConversationParam();
    if (cur === numStr) {
      lastWrittenRef.current = numStr;
      return;
    }

    // Lista → chat (sem `?c=`): push — back nativo volta à lista.
    // CUID/legado → número da mesma conversa: replace.
    // Número A → número B (troca de conversa): push.
    let mode: "push" | "replace";
    if (cur == null) {
      mode = "push";
    } else if (cur === activeId || lastWrittenRef.current === activeId) {
      mode = "replace";
    } else if (/^\d+$/.test(cur) && cur !== numStr) {
      mode = "push";
    } else {
      mode = "replace";
    }

    writeInboxConversationParam(numStr, mode);
    lastWrittenRef.current = numStr;
  }, [activeId, conversationNumber, conversationRowId, hydrated]);

  /**
   * Voltar do CRM: se a URL tem `?c=`, usa history.back() para alinhar com
   * o gesto/botão nativo. Senão só limpa o estado.
   */
  const closeActiveConversation = useCallback(() => {
    if (typeof window !== "undefined" && readInboxConversationParam()) {
      window.history.back();
      return;
    }
    setActiveId(null);
  }, [setActiveId]);

  return { hydrated, closeActiveConversation };
}
