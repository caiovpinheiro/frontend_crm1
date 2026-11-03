/**
 * Regra "Canal" do bloco Condição com número escolhido.
 */
import { describe, expect, it } from "vitest";

import {
  hydrateConditionBranches,
  normalizeRule,
  summarizeConditionConfig,
} from "@/lib/automation-condition";

const RULE = {
  field: "conversation.channel",
  op: "eq",
  value: "whatsapp",
  channelId: "ch-2",
  channelLabel: "Comercial 2 · +55 11 94262-2310",
};

describe("regra de canal com número", () => {
  it("normalizeRule mantém o número só na regra de canal", () => {
    expect(normalizeRule(RULE)).toEqual(RULE);
    expect(normalizeRule({ ...RULE, field: "contact.name" })).not.toHaveProperty("channelId");
  });

  it("abrir o bloco salvo não perde o número", () => {
    const [branch] = hydrateConditionBranches({ branches: [{ id: "b1", rules: [RULE] }] });
    expect(branch!.rules[0]!.channelId).toBe("ch-2");
  });

  it("o resumo do node mostra o número", () => {
    expect(summarizeConditionConfig({ branches: [{ id: "b1", rules: [RULE] }] })).toContain(
      "Comercial 2",
    );
    const anyNumber = { ...RULE, channelId: undefined, channelLabel: undefined };
    expect(
      summarizeConditionConfig({ branches: [{ id: "b1", rules: [anyNumber] }] }),
    ).not.toContain("·");
  });
});
