"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  proofreadText,
  type ProofreadResult,
} from "@/features/inbox-v2/api/proofread";
import { useInboxSettings } from "@/features/conversations-settings/hooks/use-inbox-settings";
import {
  isIgnoredExcerpt,
  loadProofreadPilot,
  prepareProofreadText,
  saveProofreadPilot,
} from "@/features/inbox-v2/lib/proofread-pilot";
import type { ProofreadMatch } from "@/lib/language-tool";

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
  localMatches: ProofreadMatch[],
): ProofreadResult {
  const source = result.original || prepared;
  const ltMatches = result.matches
    .map((m) => ({
      ...m,
      excerpt: m.excerpt || matchExcerpt(source, m.offset, m.length),
    }))
    .filter((m) => !isIgnoredExcerpt(m.excerpt ?? "", ignore));
  const matches = [
    ...localMatches.filter((m) => !isIgnoredExcerpt(m.excerpt ?? "", ignore)),
    ...ltMatches,
  ];
  return {
    ok: matches.length === 0,
    original: raw,
    suggested: result.suggested,
    matches,
    matchSource: raw,
  };
}

function mergeIgnore(org: string[], local: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of [...org, ...local]) {
    const n = token.trim().toLowerCase();
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

/**
 * Gate de envio: toggle e regras vêm de /settings/conversations (org).
 * Ignore extra no chip do modal fica só neste navegador.
 */
export function useProofreadSendGate() {
  const { settings } = useInboxSettings();
  const enabled = settings.proofreadEnabled;
  const localPilot = loadProofreadPilot();
  const replacements = settings.proofreadReplacementsSaved
    ? settings.proofreadReplacements
    : localPilot.replacements;
  const ignore = mergeIgnore(
    settings.proofreadIgnoreSaved ? settings.proofreadIgnore : [],
    localPilot.ignore,
  );

  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<ProofreadResult | null>(null);
  const [checking, setChecking] = useState(false);
  const cacheRef = useRef(
    new Map<string, { result: ProofreadResult; at: number }>(),
  );
  const inflightRef = useRef(new Map<string, Promise<ProofreadResult>>());

  const load = useCallback(
    async (raw: string): Promise<ProofreadResult> => {
      const { prepared, localMatches } = prepareProofreadText(
        raw,
        replacements,
        ignore,
      );
      const hit = cacheRef.current.get(prepared);
      if (hit && Date.now() - hit.at < CLIENT_CACHE_TTL_MS) {
        return applyPilotToResult(raw, prepared, hit.result, ignore, localMatches);
      }
      const pending = inflightRef.current.get(prepared);
      if (pending) {
        const next = await pending;
        return applyPilotToResult(raw, prepared, next, ignore, localMatches);
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
      return applyPilotToResult(raw, prepared, next, ignore, localMatches);
    },
    [ignore, replacements],
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

  const ignoreExcerpt = useCallback(
    (excerpt: string) => {
      const token = excerpt.trim().toLowerCase();
      if (!token) return;
      const current = loadProofreadPilot();
      const nextIgnore = current.ignore.includes(token)
        ? current.ignore
        : [...current.ignore, token];
      saveProofreadPilot({ ...current, ignore: nextIgnore });
      cacheRef.current.clear();
      setResult((prev) => {
        if (!prev) return prev;
        const source = prev.matchSource ?? prev.original;
        const matches = prev.matches.filter((m) => {
          const piece = m.excerpt || matchExcerpt(source, m.offset, m.length);
          return piece.trim().toLowerCase() !== token;
        });
        return { ...prev, matches, ok: matches.length === 0 };
      });
    },
    [],
  );

  const gate = useCallback(
    async (text: string): Promise<ProofreadGateResult> => {
      if (!enabled || !text.trim()) return { status: "ok", text };
      const { prepared, localMatches } = prepareProofreadText(
        text,
        replacements,
        ignore,
      );
      const cached = cacheRef.current.get(prepared);
      const fresh =
        cached && Date.now() - cached.at < CLIENT_CACHE_TTL_MS
          ? applyPilotToResult(text, prepared, cached.result, ignore, localMatches)
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
    [enabled, ignore, load, replacements],
  );

  return useMemo(
    () => ({
      enabled,
      open,
      setOpen,
      result,
      checking,
      gate,
      prefetch,
      close,
      ignoreExcerpt,
    }),
    [enabled, open, result, checking, gate, prefetch, close, ignoreExcerpt],
  );
}
