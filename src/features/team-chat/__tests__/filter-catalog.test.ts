import { describe, expect, it } from "vitest";

import {
  teamChatFilterChips,
  teamChatFilterSelectedCount,
  teamChatFilterTriggerLabel,
  toggleTeamChatFilter,
} from "../filter-catalog";

const counts = { diretas: 12, grupos: 4, unread: 3, favorites: 2 };

describe("teamChatFilterTriggerLabel", () => {
  it("0 filas → placeholder", () => {
    expect(teamChatFilterTriggerLabel([])).toBe("Selecione filas");
  });

  it("1 fila → nome · contagem", () => {
    expect(teamChatFilterTriggerLabel(["diretas"], counts)).toBe("Diretas · 12");
  });

  it("2+ filas → fallback textual", () => {
    expect(teamChatFilterTriggerLabel(["diretas", "grupos"], counts)).toBe("2 filas");
  });
});

describe("teamChatFilterChips", () => {
  it("respeita a ordem do catálogo", () => {
    const chips = teamChatFilterChips(["grupos", "diretas"], counts);
    expect(chips.map((c) => c.id)).toEqual(["diretas", "grupos"]);
  });
});

describe("teamChatFilterSelectedCount", () => {
  it("soma as parcelas", () => {
    expect(teamChatFilterSelectedCount(["diretas", "grupos"], counts)).toBe(16);
  });
});

describe("toggleTeamChatFilter", () => {
  it("adiciona e remove sem perder a ordem", () => {
    expect(toggleTeamChatFilter(["diretas"], "grupos")).toEqual(["diretas", "grupos"]);
    expect(toggleTeamChatFilter(["diretas", "grupos"], "diretas")).toEqual(["grupos"]);
  });
});
