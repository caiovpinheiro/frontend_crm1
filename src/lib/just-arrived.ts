"use client";

import { useSyncExternalStore } from "react";

/**
 * Chaves (conversationId / contactId) que acabaram de receber mensagem do
 * cliente. O card usa isto para o brilho de chegada: pulsa alguns
 * segundos e para. Estado por aba, sem React Query.
 */

const GLOW_MS = 4_000;
const until = new Map<string, number>();
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const fn of listeners) fn();
}

export function markJustArrived(keys: Iterable<string | null | undefined>): void {
  const end = Date.now() + GLOW_MS;
  let changed = false;
  for (const key of keys) {
    if (!key) continue;
    until.set(key, end);
    changed = true;
  }
  if (!changed) return;
  emit();
  setTimeout(() => {
    const now = Date.now();
    for (const [key, t] of until) if (t <= now) until.delete(key);
    emit();
  }, GLOW_MS + 50);
}

function isJustArrived(keys: readonly (string | null | undefined)[]): boolean {
  const now = Date.now();
  return keys.some((k) => k != null && (until.get(k) ?? 0) > now);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** `true` enquanto alguma das chaves estiver no brilho de chegada. */
export function useJustArrived(...keys: (string | null | undefined)[]): boolean {
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
  // O setTimeout de markJustArrived emite de novo no fim do brilho.
  return typeof window !== "undefined" && isJustArrived(keys);
}
