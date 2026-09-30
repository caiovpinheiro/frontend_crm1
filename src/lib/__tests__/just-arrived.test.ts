import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isJustArrived, markJustArrived, subscribeJustArrived } from "../just-arrived";

/**
 * Simula o que o React faz com `useSyncExternalStore`: a cada emissão
 * compara o snapshot novo com o anterior e só "re-renderiza" se mudou.
 */
function mountCard(keys: (string | null | undefined)[]) {
  let snapshot = isJustArrived(keys);
  let renders = 0;
  const unsubscribe = subscribeJustArrived(() => {
    const next = isJustArrived(keys);
    if (next !== snapshot) {
      snapshot = next;
      renders += 1;
    }
  });
  return { renders: () => renders, value: () => snapshot, unsubscribe };
}

describe("just-arrived (FE-3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("o snapshot é por chave: só quem foi marcado fica true", () => {
    markJustArrived(["conv-1", null, undefined]);
    expect(isJustArrived(["conv-1"])).toBe(true);
    expect(isJustArrived(["conv-2"])).toBe(false);
    expect(isJustArrived([null, "conv-1"])).toBe(true);
  });

  it("só re-renderiza os cards cujas chaves mudaram", () => {
    const marked = mountCard(["conv-1", "contact-1"]);
    const other = mountCard(["conv-2"]);

    markJustArrived(["conv-1"]);
    expect(marked.value()).toBe(true);
    expect(marked.renders()).toBe(1);
    expect(other.value()).toBe(false);
    expect(other.renders()).toBe(0);

    // Fim do brilho: o card marcado volta para false; o outro continua sem render.
    vi.advanceTimersByTime(4_100);
    expect(marked.value()).toBe(false);
    expect(marked.renders()).toBe(2);
    expect(other.renders()).toBe(0);

    marked.unsubscribe();
    other.unsubscribe();
  });

  it("chaves vazias não emitem", () => {
    const card = mountCard(["conv-1"]);
    let emissions = 0;
    const off = subscribeJustArrived(() => {
      emissions += 1;
    });
    markJustArrived([null, undefined, ""]);
    expect(emissions).toBe(0);
    expect(card.renders()).toBe(0);
    off();
    card.unsubscribe();
  });
});
