/**
 * Webchat v2 — condições de automação sobre o site: ops novos no passo
 * Condição (normalização + resumo) e condições do gatilho
 * ("Para todos os leads com"): parse, sanitização e comparação. Dados neutros.
 */
import { describe, expect, it } from "vitest";

import {
  conditionsEqual,
  parseConditions,
  sanitizeConditions,
  type TriggerCondition,
} from "@/app/(app)/settings/pipeline/trigger-conditions";
import { normalizeConditionConfig, summarizeConditionConfig } from "@/lib/automation-condition";

describe("passo Condição — campos do site", () => {
  it("normalização preserva exists / occurred_within (não vira eq)", () => {
    const cfg = normalizeConditionConfig({
      branches: [
        {
          id: "b1",
          rules: [
            { field: "siteContext.etapa", op: "exists", value: "" },
            { field: "siteContext.etapa", op: "not_exists", value: "" },
            { field: "siteEvent.passo_concluido", op: "occurred_within", value: "15" },
            { field: "siteEvent.passo_concluido", op: "not_occurred_within", value: "15" },
          ],
        },
      ],
    });
    expect(cfg.branches[0]?.rules.map((r) => r.op)).toEqual([
      "exists",
      "not_exists",
      "occurred_within",
      "not_occurred_within",
    ]);
  });

  it("resumo legível para contexto e evento do site", () => {
    const one = (rule: Record<string, unknown>) => summarizeConditionConfig({ branches: [{ id: "b", rules: [rule] }] });
    expect(one({ field: "siteContext.etapa", op: "exists", value: "" })).toBe('contexto do site "etapa" existe');
    expect(one({ field: "siteContext.etapa", op: "eq", value: "2" })).toBe('contexto do site "etapa" = 2');
    expect(one({ field: "siteContext.etapa", op: "includes", value: "ab" })).toBe('contexto do site "etapa" contém ab');
    expect(one({ field: "siteEvent.passo_concluido", op: "occurred_within", value: "30" })).toBe(
      'evento do site "passo_concluido" ocorreu nos últimos 30 min',
    );
    expect(one({ field: "siteEvent.passo_concluido", op: "not_occurred_within", value: "30" })).toBe(
      'evento do site "passo_concluido" não ocorreu nos últimos 30 min',
    );
  });
});

describe("condições do gatilho — site", () => {
  it("parse lê site_context e site_event (defensivo)", () => {
    const parsed = parseConditions({
      conditions: [
        { type: "site_context", key: "etapa", op: "eq", value: "2" },
        { type: "site_context", key: "secao", op: "inválido" },
        { type: "site_event", name: "passo_concluido", minutes: 30, op: "not_occurred" },
        { type: "site_event", name: "abriu", minutes: "x" },
        { type: "site_event", name: "" },
      ],
    });
    expect(parsed).toEqual([
      { type: "site_context", key: "etapa", op: "eq", value: "2" },
      { type: "site_context", key: "secao", op: "exists", value: "" },
      { type: "site_event", name: "passo_concluido", minutes: 30, op: "not_occurred" },
      { type: "site_event", name: "abriu", minutes: 60, op: "occurred" },
    ]);
  });

  it("sanitize tira chave/nome inválido, valor faltando e janela fora da faixa", () => {
    const list: TriggerCondition[] = [
      { type: "site_context", key: "etapa", op: "exists", value: "" },
      { type: "site_context", key: "etapa", op: "eq", value: "" },
      { type: "site_context", key: "x y", op: "exists", value: "" },
      { type: "site_event", name: "passo_concluido", minutes: 15, op: "occurred" },
      { type: "site_event", name: "passo_concluido", minutes: 0, op: "occurred" },
      { type: "site_event", name: "nome inválido", minutes: 15, op: "occurred" },
    ];
    expect(sanitizeConditions(list)).toEqual([
      { type: "site_context", key: "etapa", op: "exists", value: "" },
      { type: "site_event", name: "passo_concluido", minutes: 15, op: "occurred" },
    ]);
  });

  it("comparação percebe mudança de op, valor e janela", () => {
    const a: TriggerCondition[] = [{ type: "site_event", name: "abriu", minutes: 15, op: "occurred" }];
    expect(conditionsEqual(a, [{ type: "site_event", name: "abriu", minutes: 15, op: "occurred" }])).toBe(true);
    expect(conditionsEqual(a, [{ type: "site_event", name: "abriu", minutes: 30, op: "occurred" }])).toBe(false);
    expect(conditionsEqual(a, [{ type: "site_event", name: "abriu", minutes: 15, op: "not_occurred" }])).toBe(false);
    const c: TriggerCondition[] = [{ type: "site_context", key: "etapa", op: "eq", value: "2" }];
    expect(conditionsEqual(c, [{ type: "site_context", key: "etapa", op: "eq", value: "3" }])).toBe(false);
  });
});
