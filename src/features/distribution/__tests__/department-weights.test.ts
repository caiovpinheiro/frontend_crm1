import { describe, expect, it } from "vitest";

import {
  buildDepartmentWeights,
  formatResponsibleDepartments,
} from "../department-weights";

describe("formatResponsibleDepartments", () => {
  it("sem departamento", () => {
    expect(formatResponsibleDepartments([])).toBe("Sem departamento");
    expect(formatResponsibleDepartments(undefined)).toBe("Sem departamento");
  });

  it("mostra o peso só onde foi definido", () => {
    expect(
      formatResponsibleDepartments([
        { id: "a", name: "Acolhimento", weight: 3 },
        { id: "b", name: "Atendimento", weight: null },
        { id: "c", name: "Retenção" },
      ]),
    ).toBe("Acolhimento (peso 3), Atendimento, Retenção");
  });
});

describe("buildDepartmentWeights", () => {
  it("Acolhimento 3, Atendimento vazio = peso geral", () => {
    expect(buildDepartmentWeights(["a", "b"], { a: "3", b: "" })).toEqual({
      a: 3,
      b: null,
    });
  });

  it("ignora departamentos desmarcados e limita a 1..100", () => {
    expect(
      buildDepartmentWeights(["a", "b"], { a: "0", b: "500", c: "7" }),
    ).toEqual({ a: 1, b: 100 });
  });

  it("valor inválido vira null", () => {
    expect(buildDepartmentWeights(["a"], { a: "abc" })).toEqual({ a: null });
  });
});
