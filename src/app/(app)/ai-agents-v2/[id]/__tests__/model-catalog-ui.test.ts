import { describe, expect, it } from "vitest";

import {
  conversationCostLabel,
  costPerConversation,
  filterModels,
  lastRefreshLabel,
  modelCostNotice,
  modelPriceLabel,
  refreshSummaryLines,
  usageBasisLabel,
} from "../model-catalog-ui";

describe("catálogo de modelos na tela", () => {
  it("preço conhecido, informado pela organização e desconhecido", () => {
    expect(modelPriceLabel({ id: "gpt-4o-mini", name: "GPT-4o mini", inputPer1M: 0.15, outputPer1M: 0.6, priceSource: "builtin" })).toBe("US$ 0,15 / 0,60");
    expect(modelPriceLabel({ id: "gpt-6.1-terra", name: "GPT-6.1 Terra", inputPer1M: null, outputPer1M: null, priceSource: "unknown" })).toBe("Preço desconhecido");
    expect(modelPriceLabel({ id: "x", name: "X" })).toBe("");
  });

  it("aviso de custo só quando o preço não é o de tabela", () => {
    expect(modelCostNotice({ id: "a", name: "A", priceSource: "builtin" })).toBe("");
    expect(modelCostNotice(undefined)).toBe("");
    const unknown = modelCostNotice({ id: "b", name: "B", priceSource: "unknown", estimateInputPer1M: 4, estimateOutputPer1M: 20 });
    expect(unknown).toContain("Preço desconhecido");
    expect(unknown).toContain("US$ 4 / 20");
    expect(modelCostNotice({ id: "c", name: "C", priceSource: "org" })).toContain("organização informou");
  });

  it("resumo da atualização por provedor", () => {
    const lines = refreshSummaryLines(
      {
        openai: { ok: true, added: ["gpt-6.1-terra"], missing: ["gpt-4-turbo"] },
        anthropic: { ok: false, code: "no_key", error: "Nenhum agente da organização tem chave Anthropic gravada." },
      },
      new Map([["gpt-6.1-terra", "GPT-6.1 Terra"]]),
    );
    expect(lines).toEqual([
      { ok: true, text: "OpenAI: 1 novo (GPT-6.1 Terra); 1 não aparece mais na lista do provedor." },
      { ok: false, text: "Anthropic: Nenhum agente da organização tem chave Anthropic gravada." },
    ]);
    expect(refreshSummaryLines({ openai: { ok: true, added: [] } })[0].text).toBe("OpenAI: nenhum modelo novo.");
    const many = Array.from({ length: 11 }, (_, i) => `gpt-x-${i}`);
    expect(refreshSummaryLines({ openai: { ok: true, added: many } })[0].text).toBe(
      "OpenAI: 11 novos (gpt-x-0, gpt-x-1, gpt-x-2, gpt-x-3, gpt-x-4, gpt-x-5, gpt-x-6, gpt-x-7 e mais 3).",
    );
  });

  it("quem atualizou e quando", () => {
    expect(lastRefreshLabel(null)).toContain("ainda não foi atualizada");
    expect(lastRefreshLabel({ at: "2026-11-13T15:00:00Z", userId: "u", userName: "Marcelo", result: null })).toMatch(/^Atualizada em .+ por Marcelo\.$/);
  });
});

describe("seletor compacto", () => {
  const usage = { days: 30, conversations: 120, avgInputTokens: 5_000, avgOutputTokens: 800, models: ["gpt-5.6-luna"] };

  it("custo por conversa com a média de tokens do agente", () => {
    const luna = { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", estimateInputPer1M: 0.2, estimateOutputPer1M: 1.2, priceSource: "builtin" as const };
    // 5.000 × 0,2 + 800 × 1,2 = 1.960 por milhão → US$ 0,00196
    expect(costPerConversation(luna, usage)).toBeCloseTo(0.00196, 6);
    expect(conversationCostLabel(luna, usage)).toBe("≈ US$ 0,0020 por conversa");
    const terra = { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", inputPer1M: null, outputPer1M: null, estimateInputPer1M: 4, estimateOutputPer1M: 20, priceSource: "unknown" as const };
    expect(conversationCostLabel(terra, usage)).toBe("até US$ 0,036 por conversa");
  });

  it("sem histórico: só o preço", () => {
    expect(conversationCostLabel({ id: "a", name: "A", estimateInputPer1M: 1, estimateOutputPer1M: 1 }, null)).toBe("");
    expect(usageBasisLabel(null)).toContain("ao menos 5 conversas");
    expect(usageBasisLabel(usage)).toContain("120 conversas");
  });

  it("busca por nome ou id, sem acento e em qualquer ordem", () => {
    const list = [
      { id: "gpt-6.1-terra", name: "GPT-6.1 Terra" },
      { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
      { id: "gpt-4o-mini", name: "GPT-4o mini" },
    ];
    expect(filterModels(list, "terra").map((m) => m.id)).toEqual(["gpt-6.1-terra"]);
    expect(filterModels(list, "sonnet claude").map((m) => m.id)).toEqual(["claude-sonnet-5-5"]);
    expect(filterModels(list, "4O-MINI").map((m) => m.id)).toEqual(["gpt-4o-mini"]);
    expect(filterModels(list, "  ")).toHaveLength(3);
  });
});
