import { describe, expect, it } from "vitest";

import { createPresencePingGate, PRESENCE_PING_MIN_GAP_MS } from "../presence-ping-gate";

describe("presence ping gate (SS-3)", () => {
  it("o gap mínimo vale 45 s", () => {
    expect(PRESENCE_PING_MIN_GAP_MS).toBe(45_000);
  });

  it("libera o primeiro ping e segura os disparos por foco dentro do gap", () => {
    const gate = createPresencePingGate(45_000);
    expect(gate.begin(0)).toBe(true); // montagem
    gate.end();
    expect(gate.begin(5_000)).toBe(false); // foco
    expect(gate.begin(20_000)).toBe(false); // visibilitychange
    expect(gate.begin(44_999)).toBe(false);
    expect(gate.begin(45_000)).toBe(true); // foco depois do gap
    gate.end();
    expect(gate.lastSentAt()).toBe(45_000);
  });

  it("o timer de 90 s sempre passa", () => {
    const gate = createPresencePingGate(45_000);
    expect(gate.begin(0)).toBe(true);
    gate.end();
    expect(gate.begin(90_000)).toBe(true);
    gate.end();
    expect(gate.begin(180_000)).toBe(true);
  });

  it("não duplica com um ping em voo, mesmo fora do gap", () => {
    const gate = createPresencePingGate(45_000);
    expect(gate.begin(0)).toBe(true);
    expect(gate.begin(100_000)).toBe(false); // ainda em voo
    gate.end();
    expect(gate.begin(100_000)).toBe(true);
  });
});
