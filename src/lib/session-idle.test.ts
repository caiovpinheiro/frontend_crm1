/**
 * Última interação compartilhada entre as abas e checagem de ociosidade
 * (`session-idle.ts`). Abas com o `localStorage` falso de
 * `hooks/__tests__/fake-tabs.ts` (evento `storage` só para as OUTRAS abas).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FakeTabHub } from "@/hooks/__tests__/fake-tabs";

import {
  DEFAULT_SESSION_IDLE_MS,
  LAST_INTERACTION_STORAGE_KEY,
  LAST_INTERACTION_WRITE_MS,
  SESSION_IDLE_MS_STORAGE_KEY,
  SessionIdleClock,
  noteHumanInteraction,
} from "./session-idle";

const T0 = Date.parse("2026-10-11T12:00:00.000Z");

describe("última interação do navegador", () => {
  let hub: FakeTabHub;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    hub = new FakeTabHub();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("interação numa aba atualiza a outra (storage + evento)", async () => {
    const a = new SessionIdleClock(hub.storageFor("a"));
    const b = new SessionIdleClock(hub.storageFor("b"));
    expect(b.lastInteractionAt()).toBeNull();

    a.mark();
    await vi.advanceTimersByTimeAsync(0); // evento `storage` na outra aba
    expect(b.lastInteractionAt()).toBe(T0);

    // Mesmo com o storage ilegível depois, a aba B guardou o valor do evento.
    hub.storage.delete(LAST_INTERACTION_STORAGE_KEY);
    expect(b.lastInteractionAt()).toBe(T0);
  });

  it("grava no storage no máximo 1 vez a cada 5 s, sem perder a última", async () => {
    const storage = hub.storageFor("a");
    const set = vi.spyOn(storage, "set");
    const a = new SessionIdleClock(storage);
    for (let i = 0; i < 40; i += 1) {
      a.mark(); // digitando/rolando: 40 interações em 4 s
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(set).toHaveBeenCalledTimes(1);
    expect(a.lastInteractionAt()).toBe(T0 + 3_900); // memória exata
    await vi.advanceTimersByTimeAsync(LAST_INTERACTION_WRITE_MS);
    expect(set).toHaveBeenCalledTimes(2);
    expect(hub.storage.get(LAST_INTERACTION_STORAGE_KEY)).toBe(String(T0 + 3_900));
  });

  it("não volta no tempo: aba com interação mais velha não sobrescreve a mais nova", () => {
    const a = new SessionIdleClock(hub.storageFor("a"));
    const b = new SessionIdleClock(hub.storageFor("b"));
    b.mark(T0 + 10_000);
    a.mark(T0);
    expect(hub.storage.get(LAST_INTERACTION_STORAGE_KEY)).toBe(String(T0 + 10_000));
    expect(a.lastInteractionAt()).toBe(T0 + 10_000);
  });

  it("limite: o do último 200 do ping (compartilhado), padrão 12 h", () => {
    const a = new SessionIdleClock(hub.storageFor("a"));
    const b = new SessionIdleClock(hub.storageFor("b"));
    expect(b.idleLimitMs()).toBe(DEFAULT_SESSION_IDLE_MS);
    a.setIdleLimitMs(180_000);
    expect(b.idleLimitMs()).toBe(180_000);
    a.setIdleLimitMs(undefined); // backend antigo: sem o campo
    expect(hub.storage.get(SESSION_IDLE_MS_STORAGE_KEY)).toBe(String(DEFAULT_SESSION_IDLE_MS));
    expect(b.idleLimitMs()).toBe(DEFAULT_SESSION_IDLE_MS);
  });

  it("sem nenhuma interação registrada não expira; além do limite expira", () => {
    const a = new SessionIdleClock(hub.storageFor("a"));
    a.setIdleLimitMs(180_000);
    expect(a.isIdleExpired(T0 + 10 * 60_000)).toBe(false);
    a.mark(T0);
    expect(a.isIdleExpired(T0 + 180_000)).toBe(false);
    expect(a.isIdleExpired(T0 + 180_001)).toBe(true);
  });

  it("noteHumanInteraction confere ANTES de registrar: depois do limite → logout e não conta", () => {
    const a = new SessionIdleClock(hub.storageFor("a"));
    a.setIdleLimitMs(180_000);
    const onExpired = vi.fn();

    expect(noteHumanInteraction(a, onExpired)).toBe(true);
    vi.setSystemTime(T0 + 60_000);
    expect(noteHumanInteraction(a, onExpired)).toBe(true);
    expect(a.lastInteractionAt()).toBe(T0 + 60_000);

    vi.setSystemTime(T0 + 60_000 + 180_001);
    expect(noteHumanInteraction(a, onExpired)).toBe(false);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(a.lastInteractionAt()).toBe(T0 + 60_000); // a volta não contou
  });
});
