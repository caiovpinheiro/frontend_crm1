/** @vitest-environment jsdom */
/**
 * L2 — Funil a 1.075 px: a última etapa parecia cortada ("RETE…") e nomes
 * longos viravam "SEM REMATRÍCU…". Agora: nome em até 2 linhas com `title`,
 * coluna mínima de 112 px e gradiente na borda quando há etapas fora da vista.
 */
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { PipelineProgress, type PipelineProgressStage } from "@/components/pipeline-progress";

const STAGES: PipelineProgressStage[] = [
  "Novo",
  "Qualificação",
  "Proposta",
  "Sem rematrícula",
  "Retenção",
].map((name, i) => ({
  id: `s${i}`,
  name,
  color: "#00f",
  count: i,
  value: 0,
  entered: 0,
  lost: 0,
}));

let scrollWidth = 0;
let clientWidth = 0;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => scrollWidth);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => clientWidth);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mount() {
  return render(
    <PipelineProgress
      stages={STAGES}
      summary={{ wonCount: 0, wonValue: 0, lostCount: 0, lostValue: 0 }}
      pipelineHref="/pipeline"
    />,
  );
}

describe("funil: rolagem lateral perceptível", () => {
  it("nome da etapa em até 2 linhas, com o nome completo no title", () => {
    const view = mount();
    const heading = view.getByRole("heading", { name: "Sem rematrícula" });
    expect(heading.getAttribute("title")).toBe("Sem rematrícula");
    expect(heading.className).toContain("line-clamp-2");
    expect(heading.className).not.toContain("truncate");
  });

  it("gradiente na borda direita quando há etapas fora da vista", () => {
    scrollWidth = 900;
    clientWidth = 600;
    const view = mount();
    expect(view.container.querySelector('[data-funnel-fade="end"]')).not.toBeNull();
    expect(view.container.querySelector('[data-funnel-fade="start"]')).toBeNull();
  });

  it("sem rolagem, sem gradiente", () => {
    scrollWidth = 600;
    clientWidth = 600;
    const view = mount();
    expect(view.container.querySelector("[data-funnel-fade]")).toBeNull();
  });

  it("coluna mínima de 112 px (era 132)", () => {
    const css = readFileSync(
      join(process.cwd(), "src/styles/globals-v2.css"),
      "utf8",
    );
    const block = css.slice(css.indexOf(".pipeline-progress-col {"));
    expect(block.slice(0, block.indexOf("}"))).toContain("min-width: 112px;");
  });
});
