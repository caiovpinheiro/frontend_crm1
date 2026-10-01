import { describe, expect, it } from "vitest";
import { matchMultiSelectOptions } from "./multi-select-popover.utils";

const options = [
  { value: "c1", label: "Marcelo Silva", sub: "+5511999999999" },
  { value: "c2", label: "Ana Beatriz", sub: "ana@exemplo.com" },
  { value: "c3", label: "+5511988888888", sub: undefined },
];

describe("matchMultiSelectOptions", () => {
  it("retorna todas as opções quando a busca está vazia", () => {
    expect(matchMultiSelectOptions(options, "")).toHaveLength(3);
  });

  it("encontra por nome em qualquer parte da string", () => {
    const result = matchMultiSelectOptions(options, "Marcelo");
    expect(result.map((o) => o.value)).toEqual(["c1"]);
  });

  it("encontra por telefone ignorando formatação", () => {
    const result = matchMultiSelectOptions(options, "11999999999");
    expect(result.map((o) => o.value)).toEqual(["c1"]);
  });

  it("encontra por e-mail", () => {
    const result = matchMultiSelectOptions(options, "ana@exemplo.com");
    expect(result.map((o) => o.value)).toEqual(["c2"]);
  });

  it("encontra por múltiplas palavras", () => {
    const result = matchMultiSelectOptions(options, "marcelo silva");
    expect(result.map((o) => o.value)).toEqual(["c1"]);
  });
});
