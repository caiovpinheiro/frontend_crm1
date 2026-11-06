/** @vitest-environment jsdom */
/**
 * Aviso "Fulano está neste negócio" (cabeçalho da conversa do negócio):
 * some quando ninguém mais está; plural e "mais N" com várias pessoas.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TooltipProvider } from "@/components/ui/tooltip";

import { DealViewersStack, viewersLabel } from "../deal-viewers-stack";

const v = (name: string) => ({ userId: name, name, avatarUrl: null, lastSeen: "" });

function renderBanner(names: string[]) {
  return render(
    <TooltipProvider>
      <DealViewersStack viewers={names.map(v)} variant="banner" />
    </TooltipProvider>,
  );
}

afterEach(() => cleanup());

describe("viewersLabel", () => {
  it("singular, dois e 3+", () => {
    expect(viewersLabel(["Tamires"])).toEqual({ who: "Tamires", verb: "está" });
    expect(viewersLabel(["Tamires", "Hugo"])).toEqual({ who: "Tamires e Hugo", verb: "estão" });
    expect(viewersLabel(["Tamires", "Hugo", "Fran", "Kamilly"])).toEqual({
      who: "Tamires, Hugo e mais 2",
      verb: "estão",
    });
  });
});

describe("DealViewersStack banner", () => {
  it("ninguém mais no negócio: não mostra nada", () => {
    const { container } = renderBanner([]);
    expect(container.textContent).toBe("");
  });

  it("uma pessoa: 'Fulano está neste negócio'", () => {
    renderBanner(["Tamires"]);
    expect(screen.getByRole("status", { name: "Tamires está neste negócio" })).toBeTruthy();
  });

  it("várias pessoas: plural", () => {
    renderBanner(["Tamires", "Hugo", "Fran"]);
    expect(screen.getByRole("status", { name: "Tamires, Hugo e mais 1 estão neste negócio" })).toBeTruthy();
  });
});
