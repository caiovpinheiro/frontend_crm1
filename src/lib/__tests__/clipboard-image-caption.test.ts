import { describe, expect, it } from "vitest";
import { insertAtSelection, readPastedPlainText } from "../clipboard-image-caption";

describe("readPastedPlainText", () => {
  it("lê e apara text/plain", () => {
    const cd = { getData: (t: string) => (t === "text/plain" ? "  Teste de legenda \n" : "") };
    expect(readPastedPlainText(cd)).toBe("Teste de legenda");
  });
  it("retorna vazio sem clipboard ou com só espaços", () => {
    expect(readPastedPlainText(null)).toBe("");
    expect(readPastedPlainText({ getData: () => "   " })).toBe("");
  });
  it("não quebra se getData lançar", () => {
    expect(
      readPastedPlainText({
        getData: () => {
          throw new Error("x");
        },
      }),
    ).toBe("");
  });
});

describe("insertAtSelection", () => {
  it("insere no cursor sem apagar o restante", () => {
    expect(insertAtSelection("ab", 1, 1, "X")).toEqual({ value: "aXb", caret: 2 });
  });
  it("substitui a seleção", () => {
    expect(insertAtSelection("abcd", 1, 3, "X")).toEqual({ value: "aXd", caret: 2 });
  });
  it("sem seleção conhecida, acrescenta ao fim", () => {
    expect(insertAtSelection("ab", null, null, "X")).toEqual({ value: "abX", caret: 3 });
  });
});
