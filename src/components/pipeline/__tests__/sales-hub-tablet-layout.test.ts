/**
 * L5 (Flow) — a 768–1023 px a coluna de cards tem pelo menos 300 px e o CRM
 * do negócio não ganha um 3º track (300 + 360 não cabem e a conversa ia a ~0):
 * vira gaveta sobre a conversa. jsdom não calcula o CSS do Tailwind, então o
 * contrato é conferido nas classes do grid.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  fileURLToPath(new URL("../sales-hub-view.tsx", import.meta.url)),
  "utf8",
);

describe("SalesHubView em tablet", () => {
  it("grid do tablet: fila com mínimo de 300 px + conversa (2 tracks)", () => {
    expect(source).toContain("md:grid-cols-[minmax(300px,34%)_minmax(0,1fr)]");
  });

  it("o grid de 3 tracks (fila 300 + chat + CRM 360) só vale a partir de lg", () => {
    expect(source).toContain("lg:grid-cols-[300px_minmax(0,1fr)_minmax(360px,360px)]");
    expect(source).toContain("lg:grid-cols-[300px_minmax(0,1fr)_minmax(0px,0px)]");
    // antes: 3 tracks já em `md`, com a fila de 300 e o CRM de 360 comendo a conversa
    expect(source).not.toContain('"md:grid-cols-[300px_minmax(0,1fr)_minmax(360px,360px)]"');
    expect(source).not.toContain('"md:grid-cols-[300px_minmax(0,1fr)_minmax(0px,0px)]"');
  });

  it("CRM do negócio no tablet é gaveta sobre a conversa", () => {
    expect(source).toContain("md:max-lg:absolute");
    expect(source).toContain("md:max-lg:right-0");
    expect(source).toContain("md:max-lg:w-[min(360px,92%)]");
  });
});
