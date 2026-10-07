import { describe, expect, it } from "vitest";

import { DEPT_COLORS, assignDeptColors } from "./measure-colors";
import {
  NO_DEPARTMENT_ID,
  splitTabulationPath,
  summarizeTabulations,
  tabulationDetail,
  type TabulationRowInput,
} from "./tabulation-view";

const row = (
  path: string,
  dept: string | null,
  count: number,
  extra: Partial<TabulationRowInput> = {},
): TabulationRowInput => ({
  tabulationId: `${path}:${dept}`,
  name: path.split(" › ").pop() ?? path,
  path,
  departmentId: dept ? `id-${dept}` : null,
  departmentName: dept,
  count,
  ...extra,
});

describe("assignDeptColors", () => {
  it("só os 3 maiores ganham cor, sem repetir; os demais ficam neutros", () => {
    const map = assignDeptColors([
      { id: "a", name: "A", count: 5 },
      { id: "b", name: "B", count: 50 },
      { id: "c", name: "C", count: 20 },
      { id: "d", name: "D", count: 10 },
    ]);
    expect(map.get("b")).toBe(DEPT_COLORS[0]);
    expect(map.get("c")).toBe(DEPT_COLORS[1]);
    expect(map.get("d")).toBe(DEPT_COLORS[2]);
    expect(map.get("a")).toBeNull();
    const used = [...map.values()].filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });

  it("empate decide pelo nome (estável entre renders)", () => {
    const map = assignDeptColors([
      { id: "z", name: "Zeta", count: 5 },
      { id: "a", name: "Alfa", count: 5 },
    ]);
    expect(map.get("a")).toBe(DEPT_COLORS[0]);
    expect(map.get("z")).toBe(DEPT_COLORS[1]);
  });
});

describe("summarizeTabulations", () => {
  const rows = [
    row("Provas › Avaliação", "SAC", 19),
    row("Sem Resposta", "Retenção", 14),
    row("Acolhimento › Inicial", "Acolhimento", 10),
    row("Financeiro › Débito", "Financeiro", 4),
    row("Outro", null, 2),
  ];

  it("soma por departamento e agrupa o que passa de 3 em 'Outros'", () => {
    const s = summarizeTabulations(rows);
    expect(s.total).toBe(49);
    expect(s.depts.map((d) => d.name)).toEqual(["SAC", "Retenção", "Acolhimento", "Financeiro", "Sem departamento"]);
    expect(s.colored.map((d) => d.name)).toEqual(["SAC", "Retenção", "Acolhimento"]);
    expect(s.others).toEqual({ count: 2, total: 6 });
    expect(s.colorByDept.get(NO_DEPARTMENT_ID)).toBeNull();
  });

  it("vazio não quebra", () => {
    const s = summarizeTabulations([]);
    expect(s.total).toBe(0);
    expect(s.colored).toEqual([]);
    expect(s.others).toEqual({ count: 0, total: 0 });
  });
});

describe("linha do motivo", () => {
  it("separa folha e caminho, com número quando houver", () => {
    expect(splitTabulationPath({ path: "Acadêmico › Acesso › Senha do AVA", number: null })).toEqual({
      leaf: "Senha do AVA",
      prefix: "Acadêmico › Acesso",
    });
    expect(splitTabulationPath({ path: "Sem Resposta", number: 98 })).toEqual({
      leaf: "Sem Resposta (#98)",
      prefix: "",
    });
  });

  it("segunda linha: caminho; sem caminho ou sem cor, o departamento", () => {
    const r = { path: "Provas › Avaliação", number: null, departmentName: "SAC" };
    expect(tabulationDetail(r, DEPT_COLORS[0])).toBe("Provas");
    expect(tabulationDetail(r, null)).toBe("Provas · SAC");
    expect(tabulationDetail({ ...r, path: "Sem Resposta" }, DEPT_COLORS[0])).toBe("SAC");
    expect(tabulationDetail({ ...r, path: "Sem Resposta", departmentName: null }, null)).toBe("");
  });
});
