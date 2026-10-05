import { describe, expect, it } from "vitest";

import { canonicalFilters, canonicalFiltersKey } from "../canonical";
import type { AdvancedDealFilters } from "../types";

describe("canonicalFilters", () => {
  it("mesmo recorte em outra ordem de chaves e de ids dá a mesma chave", () => {
    const a: AdvancedDealFilters = {
      tagIds: ["t2", "t1"],
      ownerIds: ["u2", null, "u1"],
      sources: ["Site", "Indicação"],
    };
    const b: AdvancedDealFilters = {
      sources: ["Indicação", "Site"],
      ownerIds: [null, "u1", "u2", "u1"],
      tagIds: ["t1", "t2"],
    };
    expect(canonicalFiltersKey(a)).toBe(canonicalFiltersKey(b));
    expect(canonicalFilters(a)).toEqual({
      ownerIds: [null, "u1", "u2"],
      sources: ["Indicação", "Site"],
      tagIds: ["t1", "t2"],
    });
    expect(Object.keys(canonicalFilters(a))).toEqual(["ownerIds", "sources", "tagIds"]);
  });

  it("tira campos vazios e valores padrão", () => {
    expect(
      canonicalFilters({
        search: "  ",
        contactSearch: "",
        stageIds: [],
        withoutOwner: false,
        withoutTags: false,
        showAllStages: false,
        logic: "AND",
        tagMode: "any",
        createdAt: { from: null, to: "" },
        valueFrom: null,
        dealCustomFields: [],
      }),
    ).toEqual({});
    expect(canonicalFiltersKey(undefined)).toBe("{}");
    expect(canonicalFiltersKey(null)).toBe("{}");
  });

  it("mantém o que muda o resultado", () => {
    expect(
      canonicalFilters({
        search: " maria ",
        contactHasPhone: false,
        withoutContact: true,
        tagIds: ["t1"],
        tagMode: "all",
        logic: "OR",
        valueFrom: 0,
        createdAt: { from: "2026-10-01", to: null },
        lastMessageDirection: "in",
      }),
    ).toEqual({
      contactHasPhone: false,
      createdAt: { from: "2026-10-01" },
      lastMessageDirection: "in",
      logic: "OR",
      search: "maria",
      tagIds: ["t1"],
      tagMode: "all",
      valueFrom: 0,
      withoutContact: true,
    });
  });

  it("tagMode sem tags não conta", () => {
    expect(canonicalFilters({ tagMode: "none" })).toEqual({});
  });

  it("campos personalizados: ordem dos critérios e dos valores não importa", () => {
    const a: AdvancedDealFilters = {
      dealCustomFields: [
        { name: "curso", operator: "in", value: ["b", "a"] },
        { name: "cidade", operator: "eq", value: "SP" },
      ],
    };
    const b: AdvancedDealFilters = {
      dealCustomFields: [
        { name: "cidade", operator: "eq", value: "SP" },
        { name: "curso", operator: "in", value: ["a", "b"] },
      ],
    };
    expect(canonicalFiltersKey(a)).toBe(canonicalFiltersKey(b));
  });

  it("não altera o objeto recebido", () => {
    const input: AdvancedDealFilters = { tagIds: ["t2", "t1"] };
    canonicalFilters(input);
    expect(input.tagIds).toEqual(["t2", "t1"]);
  });
});
