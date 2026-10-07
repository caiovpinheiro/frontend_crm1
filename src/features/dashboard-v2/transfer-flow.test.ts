import { describe, expect, it } from "vitest";

import type { PainelTransferFlow } from "./painel-api";
import {
  FLOW_MAX_HEIGHT,
  FLOW_MIN_HEIGHT,
  OTHER_NODE_ID,
  collapseFlows,
  layoutFlows,
  linkPath,
  roundTripRoutes,
  routeKey,
  topNode,
} from "./transfer-flow";

const f = (from: string, to: string, count: number): PainelTransferFlow => ({
  from: { id: from, name: from.toUpperCase() },
  to: { id: to, name: to.toUpperCase() },
  count,
  conversations: count,
});

describe("collapseFlows", () => {
  it("agrupa a cauda em Outros", () => {
    const out = collapseFlows(
      [f("a", "x", 10), f("b", "x", 5), f("c", "x", 1), f("d", "y", 1)],
      3,
    );
    const from = new Set(out.map((r) => r.from.id));
    expect(from).toEqual(new Set(["a", "b", OTHER_NODE_ID]));
    const other = out.find(
      (r) => r.from.id === OTHER_NODE_ID && r.to.id === "x",
    );
    expect(other?.count).toBe(1);
  });

  it("não cria Outros quando cabe", () => {
    const out = collapseFlows([f("a", "x", 1), f("b", "y", 1)], 3);
    expect(out.some((r) => r.from.id === OTHER_NODE_ID)).toBe(false);
  });
});

describe("layoutFlows", () => {
  const flows = [f("a", "x", 6), f("a", "y", 2), f("b", "x", 2)];
  const layout = layoutFlows(flows, { rowHeight: 50, gap: 10, minHeight: 100 });

  it("conserva o volume nos dois lados", () => {
    expect(layout.total).toBe(10);
    const sum = (ns: { h: number }[]) => ns.reduce((a, n) => a + n.h, 0);
    expect(sum(layout.sources)).toBeCloseTo(sum(layout.targets), 6);
    expect(layout.links.reduce((a, l) => a + l.thickness, 0)).toBeCloseTo(
      sum(layout.sources),
      6,
    );
  });

  it("empilha as faixas dentro do nó sem sobrepor", () => {
    const fromA = layout.links
      .filter((l) => l.fromId === "a")
      .sort((p, q) => p.y0 - q.y0);
    expect(fromA[1].y0).toBeCloseTo(fromA[0].y0 + fromA[0].thickness, 6);
    const a = layout.sources.find((n) => n.id === "a")!;
    expect(fromA[0].y0).toBeCloseTo(a.y, 6);
  });

  it("fica vazio sem fluxos e gera path fechado", () => {
    expect(layoutFlows([]).links).toEqual([]);
    expect(linkPath(layout.links[0], 0, 100)).toMatch(/^M.*Z$/);
  });

  it("aponta quem mais transferiu e recebeu", () => {
    expect(topNode(flows, "from")?.id).toBe("a");
    expect(topNode(flows, "to")?.id).toBe("x");
  });
});

describe("altura do diagrama", () => {
  it("2 transferências ficam no mínimo de 160 px (antes 200–220)", () => {
    expect(FLOW_MIN_HEIGHT).toBe(160);
    expect(layoutFlows([f("a", "x", 1), f("b", "y", 1)]).height).toBe(160);
    expect(layoutFlows([f("a", "x", 1), f("b", "y", 1)], { rowHeight: 44, gap: 16 }).height).toBe(
      160,
    );
  });

  it("cresce com o número de nós", () => {
    const nodes = (n: number) =>
      Array.from({ length: n }, (_, i) => f(`s${i}`, `t${i}`, 5));
    const h = (n: number) => layoutFlows(nodes(n), { rowHeight: 44, gap: 16 }).height;
    expect(h(3)).toBe(160);
    expect(h(5)).toBe(220);
    expect(h(7)).toBe(308);
    expect(h(7)).toBeGreaterThan(h(5));
  });

  it("nunca passa de 480 px, e as faixas continuam com espessura positiva", () => {
    const many = Array.from({ length: 30 }, (_, i) => f(`s${i}`, `t${i}`, 3));
    const layout = layoutFlows(many, { maxNodes: 30, rowHeight: 44, gap: 16 });
    expect(FLOW_MAX_HEIGHT).toBe(480);
    expect(layout.height).toBe(480);
    expect(layout.links.every((l) => l.thickness > 0)).toBe(true);
    // todo nó cabe dentro da altura
    const last = layout.sources[layout.sources.length - 1]!;
    expect(last.y + last.h).toBeLessThanOrEqual(layout.height + 1e-6);
  });

  it("minHeight e maxHeight explícitos continuam valendo", () => {
    expect(layoutFlows([f("a", "x", 1)], { minHeight: 100 }).height).toBe(100);
    expect(layoutFlows([f("a", "x", 1)], { minHeight: 300, maxHeight: 200 }).height).toBe(300);
  });
});

describe("roundTripRoutes", () => {
  it("marca as duas pontas da ida e volta, e só elas", () => {
    const flows = [f("a", "b", 5), f("b", "a", 3), f("a", "c", 2)];
    const set = roundTripRoutes(flows);
    expect(set.has(routeKey("a", "b"))).toBe(true);
    expect(set.has(routeKey("b", "a"))).toBe(true);
    expect(set.has(routeKey("a", "c"))).toBe(false);
    expect(roundTripRoutes([]).size).toBe(0);
  });
});
