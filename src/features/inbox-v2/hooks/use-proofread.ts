"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  proofreadText,
  type ProofreadResult,
} from "@/features/inbox-v2/api/proofread";

export const PROOFREAD_ENABLED_KEY = "eduit:proofread:enabled";

export type ProofreadGateStatus = "ok" | "block" | "unavailable";

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
 */
export function useProofreadSendGate() {
  const { enabled, persistEnabled } = useProofreadPreference();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [checking, setChecking] = useState(false);

  const close = useCallback(() => {
    setOpen(false);
    setResult(null);
  }, []);

  const gate = useCallback(
    async (text: string): Promise<ProofreadGateStatus> => {
      if (!enabled || !text.trim()) return "ok";
      setChecking(true);
      try {
        const next = await proofreadText(text);
        if (next.matches.length > 0) {
          setResult(next);
          setOpen(true);
          return "block";
        }
        return "ok";
      } catch {
        toast.error("Corretor indisponível");
        return "unavailable";
      } finally {
        setChecking(false);
      }
    },
    [enabled],
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
      close,
    }),
    [enabled, persistEnabled, open, result, checking, gate, close],
  );
}
