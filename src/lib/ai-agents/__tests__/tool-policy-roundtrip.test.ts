import { describe, expect, it } from "vitest";

import {
  emptyToolPolicy,
  isEmptyToolPolicy,
  normalizeToolConfig,
  normalizeToolPolicy,
  type ToolConfigMap,
  type ToolPolicy,
} from "@/lib/ai-agents/steering";

/**
 * `ToolPolicy` desta tela é cópia do tipo do backend, e a tela salva o
 * objeto inteiro. Enquanto a normalização DESCARTAVA chave desconhecida,
 * todo campo novo do backend era apagado do banco no próximo "Salvar" —
 * aconteceu com `readableFields` e depois com `sensitiveTerms`.
 *
 * Estes testes travam a passagem intacta. Quem remover a preservação
 * quebra aqui, em vez de descobrir pelo dado apagado de um cliente.
 */

/// Campo que só o backend conhece. O nome é fictício de propósito: o teste
/// vale para o PRÓXIMO campo, não para um que já existe.
const BACKEND_ONLY = "campoQueSoOBackendConhece";

/// Reproduz o `patchPolicy` das seções (tools-section, crm-fields-section).
function patchPolicy(
  config: ToolConfigMap,
  toolId: string,
  partial: Partial<ToolPolicy>,
): ToolConfigMap {
  const policy = config[toolId] ?? emptyToolPolicy();
  const nextPolicy = { ...emptyToolPolicy(), ...policy, ...partial };
  const next: ToolConfigMap = { ...config };
  if (isEmptyToolPolicy(nextPolicy)) delete next[toolId];
  else next[toolId] = nextPolicy;
  return next;
}

describe("ToolPolicy: chave desconhecida sobrevive ao round-trip", () => {
  it("normalizeToolPolicy preserva campo que a tela não conhece", () => {
    const policy = normalizeToolPolicy({
      readableFields: ["deal.curso"],
      [BACKEND_ONLY]: ["valor-gravado-pelo-backend"],
    });
    expect(policy.readableFields).toEqual(["deal.curso"]);
    expect(
      (policy as unknown as Record<string, unknown>)[BACKEND_ONLY],
    ).toEqual(["valor-gravado-pelo-backend"]);
  });

  it("editar outra seção não apaga o campo desconhecido", () => {
    const loaded = normalizeToolConfig({
      search_crm_records: {
        readableFields: ["deal.curso"],
        [BACKEND_ONLY]: { ligado: true },
      },
    });
    // O operador mexe só na allowlist de campos; nunca abriu a seção do
    // campo novo. O que vai no PUT tem de continuar com ele.
    const saved = patchPolicy(loaded, "search_crm_records", {
      readableFields: ["deal.curso", "deal.polo"],
    });
    const raw = saved.search_crm_records as unknown as Record<string, unknown>;
    expect(raw.readableFields).toEqual(["deal.curso", "deal.polo"]);
    expect(raw[BACKEND_ONLY]).toEqual({ ligado: true });
    expect(JSON.stringify(saved)).toContain(BACKEND_ONLY);
  });

  it("policy cujo único conteúdo é campo desconhecido não é descartada", () => {
    const policy = normalizeToolPolicy({ [BACKEND_ONLY]: "algo" });
    expect(isEmptyToolPolicy(policy)).toBe(false);
    const config = normalizeToolConfig({
      consultar_matricula: { [BACKEND_ONLY]: "algo" },
    });
    expect(Object.keys(config)).toEqual(["consultar_matricula"]);
  });

  it("policy de fato vazia continua sendo descartada", () => {
    expect(isEmptyToolPolicy(emptyToolPolicy())).toBe(true);
    expect(normalizeToolConfig({ search_crm_records: {} })).toEqual({});
  });

  it("campo conhecido continua normalizado (lixo não passa)", () => {
    const policy = normalizeToolPolicy({
      readableFields: ["deal.curso", "  ", "deal.curso", 42],
      allowOrgWideSearch: "sim",
      defaultType: "   ",
    });
    expect(policy.readableFields).toEqual(["deal.curso"]);
    expect(policy.allowOrgWideSearch).toBe(true);
    expect(policy.defaultType).toBeNull();
  });
});
