"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  proofreadText,
  type ProofreadResult,
} from "@/features/inbox-v2/api/proofread";

export const PROOFREAD_ENABLED_KEY = "eduit:proofread:enabled";

export type ProofreadGateStatus = "ok" | "block" | "unavailable";

const CLIENT_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_MAX = 8;

/** Preferência do agente: corretor automático (default desligado). */
export function useProofreadPreference() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    try {
      setEnabled(window.localStorage.getItem(PROOFREAD_ENABLED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  const persistEnabled = useCallback((v: boolean) => {
    setEnabled(v);
    try {
      window.localStorage.setItem(PROOFREAD_ENABLED_KEY, v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  return { enabled, persistEnabled };
}

/**
 * Gate de envio: se o toggle estiver ligado, chama o LanguageTool.
 * Fail-open quando o serviço falha (toast + deixa enviar).
 * Prefetch no debounce do composer evita esperar o Java no clique de enviar.
 */
export function useProofreadSendGate() {
  const { enabled, persistEnabled } = useProofreadPreference();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [checking, setChecking] = useState(false);
  const cacheRef = useRef(
    new Map<string, { result: ProofreadResult; at: number }>(),
  );
  const inflightRef = useRef(new Map<string, Promise<ProofreadResult>>());

  const load = useCallback(async (text: string): Promise<ProofreadResult> => {
    const key = text;
    const hit = cacheRef.current.get(key);
    if (hit && Date.now() - hit.at < CLIENT_CACHE_TTL_MS) {
      return hit.result;
    }
    const pending = inflightRef.current.get(key);
    if (pending) return pending;
    const promise = proofreadText(text)
      .then((next) => {
        const cache = cacheRef.current;
        if (cache.size >= CLIENT_CACHE_MAX) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(key, { result: next, at: Date.now() });
        return next;
      })
      .finally(() => {
        inflightRef.current.delete(key);
      });
    inflightRef.current.set(key, promise);
    return promise;
  }, []);

  const prefetch = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!enabled || !trimmed) return;
      void load(trimmed);
    },
    [enabled, load],
  );

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
  }, []);

  const gate = useCallback(
    async (text: string): Promise<ProofreadGateStatus> => {
      if (!enabled || !text.trim()) return "ok";
      const cached = cacheRef.current.get(text);
      const fresh =
        cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS
          ? cached.result
          : null;
      if (!fresh) setChecking(true);
      try {
        const next = fresh ?? (await load(text));
        if (next.matches.length > 0) {
          setResult(next);
          setOpen(true);
          return "block";
        }
        return "ok";
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        toast.error(
          detail && detail !== "Corretor indisponível"
            ? `Corretor indisponível: ${detail}`
            : "Corretor indisponível",
        );
        return "unavailable";
      } finally {
        setChecking(false);
      }
    },
    [enabled, load],
  );

  return useMemo(
    () => ({
      enabled,
      persistEnabled,
      open,
      setOpen,
      result,
      checking,
      gate,
      prefetch,
      close,
    }),
    [enabled, persistEnabled, open, result, checking, gate, prefetch, close],
  );
}
