import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetSingleLeaderForTests,
  isSingleLeaderEnabled,
  resolveSingleLeader,
  SSE_SINGLE_LEADER_STORAGE_KEY,
} from "./sse-single-leader";

describe("resolveSingleLeader", () => {
  it("ligado por padrão; só a env \"0\" desliga", () => {
    expect(resolveSingleLeader(undefined, null)).toBe(true);
    expect(resolveSingleLeader("", null)).toBe(true);
    expect(resolveSingleLeader("1", null)).toBe(true);
    expect(resolveSingleLeader("true", null)).toBe(true);
    expect(resolveSingleLeader("0", null)).toBe(false);
    expect(resolveSingleLeader(" 0 ", null)).toBe(false);
  });

  it("o override do localStorage vence a env nos dois sentidos", () => {
    expect(resolveSingleLeader(undefined, "0")).toBe(false);
    expect(resolveSingleLeader("1", "0")).toBe(false);
    expect(resolveSingleLeader("0", "1")).toBe(true);
    // Valor desconhecido não é override.
    expect(resolveSingleLeader("0", "sim")).toBe(false);
    expect(resolveSingleLeader(undefined, "")).toBe(true);
  });
});

describe("isSingleLeaderEnabled", () => {
  const store = new Map<string, string>();
  const getItem = vi.fn((key: string) => store.get(key) ?? null);

  beforeEach(() => {
    store.clear();
    getItem.mockClear();
    __resetSingleLeaderForTests();
    vi.stubGlobal("window", { localStorage: { getItem } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    __resetSingleLeaderForTests();
  });

  it("sem env nem override: ligado", () => {
    expect(isSingleLeaderEnabled()).toBe(true);
    expect(getItem).toHaveBeenCalledWith("bwipo:sse-single-leader");
    expect(SSE_SINGLE_LEADER_STORAGE_KEY).toBe("bwipo:sse-single-leader");
  });

  it("NEXT_PUBLIC_SSE_SINGLE_LEADER=0 desliga; localStorage \"1\" religa neste navegador", () => {
    vi.stubEnv("NEXT_PUBLIC_SSE_SINGLE_LEADER", "0");
    expect(isSingleLeaderEnabled()).toBe(false);

    __resetSingleLeaderForTests();
    store.set(SSE_SINGLE_LEADER_STORAGE_KEY, "1");
    expect(isSingleLeaderEnabled()).toBe(true);
  });

  it("localStorage \"0\" desliga sem rebuild", () => {
    store.set(SSE_SINGLE_LEADER_STORAGE_KEY, "0");
    expect(isSingleLeaderEnabled()).toBe(false);
  });

  it("lê uma vez: mudar o storage depois não troca o modo da página", () => {
    expect(isSingleLeaderEnabled()).toBe(true);
    store.set(SSE_SINGLE_LEADER_STORAGE_KEY, "0");
    expect(isSingleLeaderEnabled()).toBe(true);
    expect(getItem).toHaveBeenCalledTimes(1);
  });

  it("storage bloqueado (exceção) cai na env", () => {
    getItem.mockImplementationOnce(() => {
      throw new Error("SecurityError");
    });
    expect(isSingleLeaderEnabled()).toBe(true);
  });
});
