"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  proofreadText,
  type ProofreadResult,
} from "@/features/inbox-v2/api/proofread";
import {
  applyPilotReplacements,
  isIgnoredExcerpt,
  loadProofreadPilot,
  saveProofreadPilot,
  type ProofreadPilotConfig,
} from "@/features/inbox-v2/lib/proofread-pilot";

export const PROOFREAD_ENABLED_KEY = "eduit:proofread:enabled";

export type ProofreadGateStatus = "ok" | "block" | "unavailable";

export type ProofreadGateResult = {
  status: ProofreadGateStatus;
  text: string;
};

const CLIENT_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_MAX = 8;

function matchExcerpt(source: string, offset: number, length: number): string {
  if (offset < 0 || length <= 0 || offset + length > source.length) return "";
  return source.slice(offset, offset + length);
}

function applyPilotToResult(
  raw: string,
  prepared: string,
  result: ProofreadResult,
  ignore: string[],
): ProofreadResult {
  const source = result.original || prepared;
  const matches = result.matches.filter((m) => {
    const excerpt = matchExcerpt(source, m.offset, m.length);
    return !isIgnoredExcerpt(excerpt, ignore);
  });
  return {
    ok: matches.length === 0,
    original: raw,
    suggested: result.suggested,
    matches,
    matchSource: source,
  };
}

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

export function useProofreadPilot() {
  const [pilot, setPilot] = useState<ProofreadPilotConfig>({
    replacements: [],
    ignore: [],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    setPilot(loadProofreadPilot());
  }, []);

  const persistPilot = useCallback((next: ProofreadPilotConfig) => {
    setPilot(next);
    saveProofreadPilot(next);
  }, []);

  // cache do gate vive no hook pai — limpo ao salvar regras

  return { pilot, persistPilot, settingsOpen, setSettingsOpen };
}

/**
 * Gate de envio: se o toggle estiver ligado, chama o LanguageTool.
 * Fail-open quando o serviço falha (toast + deixa enviar).
 * Prefetch no debounce do composer evita esperar o Java no clique de enviar.
 */
export function useProofreadSendGate() {
  const { enabled, persistEnabled } = useProofreadPreference();
  const { pilot, persistPilot, settingsOpen, setSettingsOpen } =
    useProofreadPilot();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [checking, setChecking] = useState(false);
  const cacheRef = useRef(
    new Map<string, { result: ProofreadResult; at: number }>(),
  );
  const inflightRef = useRef(new Map<string, Promise<ProofreadResult>>());
  const rawByPreparedRef = useRef(new Map<string, string>());

  const load = useCallback(
    async (raw: string): Promise<ProofreadResult> => {
      const prepared = applyPilotReplacements(raw, pilot.replacements);
      rawByPreparedRef.current.set(prepared, raw);
      const hit = cacheRef.current.get(prepared);
      if (hit && Date.now() - hit.at < CLIENT_CACHE_TTL_MS) {
        return applyPilotToResult(raw, prepared, hit.result, pilot.ignore);
      }
      const pending = inflightRef.current.get(prepared);
      if (pending) {
        const next = await pending;
        return applyPilotToResult(raw, prepared, next, pilot.ignore);
      }
      const promise = proofreadText(prepared)
        .then((next) => {
          const cache = cacheRef.current;
          if (cache.size >= CLIENT_CACHE_MAX) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          cache.set(prepared, { result: next, at: Date.now() });
          return next;
        })
        .finally(() => {
          inflightRef.current.delete(prepared);
        });
      inflightRef.current.set(prepared, promise);
      const next = await promise;
      return applyPilotToResult(raw, prepared, next, pilot.ignore);
    },
    [pilot.ignore, pilot.replacements],
  );

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

  const persistPilotAndClear = useCallback(
    (next: ProofreadPilotConfig) => {
      persistPilot(next);
      cacheRef.current.clear();
    },
    [persistPilot],
  );

  const ignoreExcerpt = useCallback(
    (excerpt: string) => {
      const token = excerpt.trim().toLowerCase();
      if (!token) return;
      const nextIgnore = pilot.ignore.includes(token)
        ? pilot.ignore
        : [...pilot.ignore, token];
      persistPilotAndClear({ ...pilot, ignore: nextIgnore });
      cacheRef.current.clear();
      setResult((prev) => {
        if (!prev) return prev;
        const source = prev.matchSource ?? prev.original;
        const matches = prev.matches.filter((m) => {
          const piece = matchExcerpt(source, m.offset, m.length);
          return piece.trim().toLowerCase() !== token;
        });
        return { ...prev, matches, ok: matches.length === 0 };
      });
    },
    [persistPilotAndClear, pilot],
  );

  const gate = useCallback(
    async (text: string): Promise<ProofreadGateResult> => {
      if (!enabled || !text.trim()) return { status: "ok", text };
      const prepared = applyPilotReplacements(text, pilot.replacements);
      const cached = cacheRef.current.get(prepared);
      const fresh =
        cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS
          ? applyPilotToResult(text, prepared, cached.result, pilot.ignore)
          : null;
      if (!fresh) setChecking(true);
      try {
        const next = fresh ?? (await load(text));
        if (next.matches.length > 0) {
          setResult(next);
          setOpen(true);
          return { status: "block", text };
        }
        return { status: "ok", text: next.suggested || prepared };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        toast.error(
          detail && detail !== "Corretor indisponível"
            ? `Corretor indisponível: ${detail}`
            : "Corretor indisponível",
        );
        return { status: "unavailable", text };
      } finally {
        setChecking(false);
      }
    },
    [enabled, load, pilot.ignore, pilot.replacements],
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
      ignoreExcerpt,
      pilot,
      persistPilot: persistPilotAndClear,
      settingsOpen,
      setSettingsOpen,
    }),
    [
      enabled,
      persistEnabled,
      open,
      result,
      checking,
      gate,
      prefetch,
      close,
      ignoreExcerpt,
      pilot,
      persistPilotAndClear,
      settingsOpen,
    ],
  );
}
