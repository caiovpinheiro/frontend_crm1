/*
 * Layout do diagrama de fluxo (Sankey de 2 colunas) das transferências:
 * origens à esquerda, destinos à direita, faixas proporcionais ao volume.
 * Puro — testado em transfer-flow.test.ts.
 */

import type { PainelTransferFlow } from "./painel-api";

export const OTHER_NODE_ID = "__other__";
export const OTHER_NODE_NAME = "Outros";

export type FlowNode = {
  id: string;
  name: string;
  total: number;
  y: number;
  h: number;
};

export type FlowLink = {
  fromId: string;
  toId: string;
  fromName: string;
  toName: string;
  count: number;
  conversations: number;
  /** Topo/base da faixa na origem e no destino. */
  y0: number;
  y1: number;
  thickness: number;
};

export type FlowLayout = {
  sources: FlowNode[];
  targets: FlowNode[];
  links: FlowLink[];
  height: number;
  total: number;
};

export type FlowSide = { id: string; name: string; total: number };

/** Mantém os `max` maiores de cada lado; o resto vira "Outros". */
export function collapseFlows(
  flows: PainelTransferFlow[],
  max: number,
): PainelTransferFlow[] {
  const outTotals = new Map<string, number>();
  const inTotals = new Map<string, number>();
  for (const f of flows) {
    outTotals.set(f.from.id, (outTotals.get(f.from.id) ?? 0) + f.count);
    inTotals.set(f.to.id, (inTotals.get(f.to.id) ?? 0) + f.count);
  }
  const keep = (totals: Map<string, number>) => {
    const ids = [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
    // Não vale criar "Outros" para um nó só.
    return new Set(ids.length <= max ? ids : ids.slice(0, max - 1));
  };
  const keepFrom = keep(outTotals);
  const keepTo = keep(inTotals);
  const other = { id: OTHER_NODE_ID, name: OTHER_NODE_NAME };
  const merged = new Map<string, PainelTransferFlow>();
  for (const f of flows) {
    const from = keepFrom.has(f.from.id) ? f.from : other;
    const to = keepTo.has(f.to.id) ? f.to : other;
    const key = `${from.id}\u0000${to.id}`;
    const cur = merged.get(key);
    if (cur) {
      cur.count += f.count;
      cur.conversations += f.conversations;
    } else {
      merged.set(key, {
        from,
        to,
        count: f.count,
        conversations: f.conversations,
      });
    }
  }
  return [...merged.values()];
}

function sides(flows: PainelTransferFlow[], pick: "from" | "to"): FlowSide[] {
  const map = new Map<string, FlowSide>();
  for (const f of flows) {
    const n = f[pick];
    const cur = map.get(n.id) ?? { id: n.id, name: n.name, total: 0 };
    cur.total += f.count;
    map.set(n.id, cur);
  }
  return [...map.values()].sort((a, b) => {
    if (a.id === OTHER_NODE_ID) return 1;
    if (b.id === OTHER_NODE_ID) return -1;
    return b.total - a.total || a.name.localeCompare(b.name, "pt-BR");
  });
}

export function layoutFlows(
  flows: PainelTransferFlow[],
  opts: {
    maxNodes?: number;
    rowHeight?: number;
    gap?: number;
    minHeight?: number;
  } = {},
): FlowLayout {
  const maxNodes = opts.maxNodes ?? 7;
  const rowHeight = opts.rowHeight ?? 40;
  const gap = opts.gap ?? 10;
  const collapsed = collapseFlows(flows, maxNodes);
  const srcSide = sides(collapsed, "from");
  const dstSide = sides(collapsed, "to");
  const total = collapsed.reduce((acc, f) => acc + f.count, 0);
  const rows = Math.max(srcSide.length, dstSide.length, 1);
  const height = Math.max(opts.minHeight ?? 200, rows * rowHeight);
  if (total === 0)
    return { sources: [], targets: [], links: [], height, total: 0 };

  // Mesma escala dos dois lados; cada lado centraliza a sobra vertical.
  const k = Math.min(
    (height - gap * (srcSide.length - 1)) / total,
    (height - gap * (dstSide.length - 1)) / total,
  );
  const place = (side: FlowSide[]): FlowNode[] => {
    const used = total * k + gap * (side.length - 1);
    let y = (height - used) / 2;
    return side.map((s) => {
      const node = { ...s, y, h: s.total * k };
      y += node.h + gap;
      return node;
    });
  };
  const sources = place(srcSide);
  const targets = place(dstSide);
  const srcIdx = new Map(sources.map((n, i) => [n.id, i]));
  const dstIdx = new Map(targets.map((n, i) => [n.id, i]));

  const srcCursor = new Map(sources.map((n) => [n.id, n.y]));
  const dstCursor = new Map(targets.map((n) => [n.id, n.y]));
  // Ordem dentro do nó segue a ordem do outro lado → faixas não se cruzam à toa.
  const ordered = [...collapsed].sort(
    (a, b) =>
      srcIdx.get(a.from.id)! - srcIdx.get(b.from.id)! ||
      dstIdx.get(a.to.id)! - dstIdx.get(b.to.id)!,
  );
  const y0ByKey = new Map<string, number>();
  for (const f of ordered) {
    const y0 = srcCursor.get(f.from.id)!;
    y0ByKey.set(`${f.from.id}\u0000${f.to.id}`, y0);
    srcCursor.set(f.from.id, y0 + f.count * k);
  }
  const byTarget = [...collapsed].sort(
    (a, b) =>
      dstIdx.get(a.to.id)! - dstIdx.get(b.to.id)! ||
      srcIdx.get(a.from.id)! - srcIdx.get(b.from.id)!,
  );
  const links: FlowLink[] = byTarget.map((f) => {
    const y1 = dstCursor.get(f.to.id)!;
    dstCursor.set(f.to.id, y1 + f.count * k);
    return {
      fromId: f.from.id,
      toId: f.to.id,
      fromName: f.from.name,
      toName: f.to.name,
      count: f.count,
      conversations: f.conversations,
      y0: y0ByKey.get(`${f.from.id}\u0000${f.to.id}`)!,
      y1,
      thickness: f.count * k,
    };
  });
  return { sources, targets, links, height, total };
}

/** Abaixo desta largura (px) o diagrama empilha os rótulos e reserva uma coluna menor. */
export const SANKEY_COMPACT_BELOW = 560;

export type SankeyGeometry = {
  /** Largura do viewBox (1 unidade = 1 px: o texto não é escalado). */
  width: number;
  /** Largura reservada para os rótulos de cada lado. */
  labelW: number;
  barW: number;
  /** Fim da barra de origem / início da barra de destino. */
  x0: number;
  x1: number;
  /** Estreito: nome e contagem em duas linhas, nome mais curto. */
  compact: boolean;
  /** Máximo de caracteres do nome antes de cortar com "…". */
  nameChars: number;
};

/**
 * Geometria horizontal do diagrama a partir da largura do container. No celular
 * (< 560 px) os dois lados reservam uma coluna proporcional (~30%) para o nome,
 * com a contagem numa 2ª linha; sem isso, o lado "PARA" ficava fora da tela.
 */
export function sankeyGeometry(containerWidth: number): SankeyGeometry {
  const raw = Number.isFinite(containerWidth) ? Math.round(containerWidth) : 720;
  const compact = raw < SANKEY_COMPACT_BELOW;
  const width = compact ? Math.max(280, raw) : Math.min(960, raw);
  const barW = 6;
  const gap = 8;
  const labelW = compact ? Math.max(76, Math.min(128, Math.round(width * 0.3))) : 170;
  return {
    width,
    labelW,
    barW,
    x0: labelW + gap + barW,
    x1: width - labelW - gap - barW,
    compact,
    nameChars: compact ? Math.max(8, Math.floor(labelW / 6.6)) : 24,
  };
}

/** Caminho SVG de uma faixa (curva cúbica horizontal). */
export function linkPath(link: FlowLink, x0: number, x1: number): string {
  const xm = (x0 + x1) / 2;
  const t = Math.max(1, link.thickness);
  const a = link.y0;
  const b = link.y1;
  return [
    `M${x0},${a}`,
    `C${xm},${a} ${xm},${b} ${x1},${b}`,
    `L${x1},${b + t}`,
    `C${xm},${b + t} ${xm},${a + t} ${x0},${a + t}`,
    "Z",
  ].join(" ");
}

/** Quem mais transferiu / mais recebeu (sem "Outros"). */
export function topNode(
  flows: PainelTransferFlow[],
  pick: "from" | "to",
): FlowSide | null {
  return sides(flows, pick).find((s) => s.id !== OTHER_NODE_ID) ?? null;
}

export function routeKey(fromId: string, toId: string): string {
  return `${fromId}\u0000${toId}`;
}

/** Rotas cuja inversa também existe ("ida e volta"), pela chave `routeKey`. */
export function roundTripRoutes(flows: PainelTransferFlow[]): Set<string> {
  const all = new Set(flows.map((f) => routeKey(f.from.id, f.to.id)));
  const out = new Set<string>();
  for (const f of flows) {
    if (f.from.id === f.to.id) continue;
    if (all.has(routeKey(f.to.id, f.from.id))) out.add(routeKey(f.from.id, f.to.id));
  }
  return out;
}
