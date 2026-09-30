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

function emit() {
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

/** `true` se alguma das chaves está no brilho de chegada agora. */
export function isJustArrived(keys: readonly (string | null | undefined)[]): boolean {
  const now = Date.now();
  return keys.some((k) => k != null && (until.get(k) ?? 0) > now);
}

export function subscribeJustArrived(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const getServerSnapshot = () => false;

/**
 * `true` enquanto alguma das chaves estiver no brilho de chegada.
 *
 * O snapshot é o booleano das chaves deste card, não um contador global:
 * `markJustArrived` emite para todos os assinantes, mas o React só
 * re-renderiza quem teve o valor alterado. Com o contador, cada mensagem
 * da org re-renderizava todos os `ConversationCard`/`DealCard` montados.
 */
export function useJustArrived(...keys: (string | null | undefined)[]): boolean {
  // O setTimeout de markJustArrived emite de novo no fim do brilho.
  return useSyncExternalStore(
    subscribeJustArrived,
    () => isJustArrived(keys),
    getServerSnapshot,
  );
}
