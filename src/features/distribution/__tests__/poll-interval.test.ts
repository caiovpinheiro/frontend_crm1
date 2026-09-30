import { describe, expect, it } from "vitest";

import {
  COUNTS_POLL_MS,
  distributionPollInterval,
  QUEUE_POLL_MS,
  QUEUE_SAFETY_POLL_MS,
  QUEUE_SSE_DEBOUNCE_MS,
} from "../hooks";

describe("widget de distribuição — intervalos (FE-16)", () => {
  it("debounce do SSE entre 5 e 10 s; poll de segurança de 120 s", () => {
    expect(QUEUE_SSE_DEBOUNCE_MS).toBeGreaterThanOrEqual(5_000);
    expect(QUEUE_SSE_DEBOUNCE_MS).toBeLessThanOrEqual(10_000);
    expect(QUEUE_SAFETY_POLL_MS).toBe(120_000);
    expect(QUEUE_POLL_MS).toBe(20_000);
    expect(COUNTS_POLL_MS).toBe(30_000);
  });

  it("sem SSE ativo, mantém o poll base", () => {
    expect(
      distributionPollInterval({ enabled: true, poll: true, sseActive: false, baseMs: COUNTS_POLL_MS }),
    ).toBe(COUNTS_POLL_MS);
    expect(
      distributionPollInterval({ enabled: true, poll: true, sseActive: false, baseMs: QUEUE_POLL_MS }),
    ).toBe(QUEUE_POLL_MS);
  });

  it("com SSE ativo, cai para o poll de segurança", () => {
    expect(
      distributionPollInterval({ enabled: true, poll: true, sseActive: true, baseMs: COUNTS_POLL_MS }),
    ).toBe(QUEUE_SAFETY_POLL_MS);
  });

  it("query desligada ou poll desligado = sem intervalo", () => {
    expect(
      distributionPollInterval({ enabled: false, poll: true, sseActive: false, baseMs: 1 }),
    ).toBe(false);
    expect(
      distributionPollInterval({ enabled: true, poll: false, sseActive: true, baseMs: 1 }),
    ).toBe(false);
  });
});
