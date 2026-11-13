import { describe, expect, it } from "vitest";

import { lastRefreshLabel, modelCostNotice, modelPriceLabel, refreshSummaryLines } from "../model-catalog-ui";

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
  });

  it("quem atualizou e quando", () => {
    expect(lastRefreshLabel(null)).toContain("ainda não foi atualizada");
    expect(lastRefreshLabel({ at: "2026-11-13T15:00:00Z", userId: "u", userName: "Marcelo", result: null })).toMatch(/^Atualizada em .+ por Marcelo\.$/);
  });
});
