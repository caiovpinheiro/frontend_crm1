import { describe, expect, it } from "vitest";

import { GROUP_MESSAGES_POLL_MS, groupMessagesPollInterval } from "../hooks";

describe("grupos WhatsApp — poll das mensagens (FE-21)", () => {
  it("30 s com grupo aberto e aba visível", () => {
    expect(GROUP_MESSAGES_POLL_MS).toBe(30_000);
    expect(groupMessagesPollInterval(true, true)).toBe(30_000);
  });

  it("pausa com a aba oculta ou sem grupo selecionado", () => {
    expect(groupMessagesPollInterval(true, false)).toBe(false);
    expect(groupMessagesPollInterval(false, true)).toBe(false);
  });
});
