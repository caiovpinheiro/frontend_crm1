import { describe, expect, it } from "vitest";

import { pathTarget } from "../config-validation-target";

const config = { themes: [{ id: "t-a", name: "Troca" }, { id: "t-b", name: "Prazo" }] };

describe("pathTarget", () => {
  it("assunto: seção Do que ele cuida, aba Assuntos, com o id e o nome do assunto", () => {
    expect(pathTarget("themes[1].when[0]", config)).toEqual({ section: "cuida", tab: "assuntos", themeId: "t-b", label: "Do que ele cuida › Assuntos › “Prazo”" });
    expect(pathTarget("themes[0].handoffDestination", config).themeId).toBe("t-a");
    expect(pathTarget("themes[7].tabulationId", config)).toMatchObject({ section: "cuida", tab: "assuntos", themeId: undefined });
  });

  it("demais campos caem na seção/aba que os edita", () => {
    expect(pathTarget("rules[0].actions[1].destination", config)).toMatchObject({ section: "cuida", tab: "atalhos" });
    expect(pathTarget("scope.forbidden[0].destination", config)).toMatchObject({ section: "cuida", tab: "escopo" });
    expect(pathTarget("handoff.defaultDestination", config)).toMatchObject({ section: "equipe", label: "Chamar a equipe" });
    expect(pathTarget("handoff.message", config).section).toBe("equipe");
    expect(pathTarget("entry.openingMessage", config).section).toBe("comeco");
    expect(pathTarget("closure", config).section).toBe("comeco");
    expect(pathTarget("tabulation.byTheme.t-b", config).section).toBe("comeco");
    expect(pathTarget("calendar.events[3]", config)).toMatchObject({ section: "sabe", tab: "calendario" });
    expect(pathTarget("variables[1].key", config)).toMatchObject({ section: "sabe", tab: "dados" });
    expect(pathTarget("channelIds", config).section).toBe("publicacao");
    expect(pathTarget("algo.desconhecido", null).section).toBe("inicio");
  });
});
