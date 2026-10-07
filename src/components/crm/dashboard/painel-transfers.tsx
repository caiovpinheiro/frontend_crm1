"use client";

/*
 * Aba Atendimentos › Transferências de conversas (turquesa = transferências).
 * Fluxo origem → destino (pessoa → pessoa ou departamento → departamento), com a
 * rota principal em destaque, + lista das principais rotas e selo "ida e volta".
 * Respeita período e filtros da aba.
 */

import { useMemo, useState } from "react";

import {
  PainelBlockError,
  PainelCard,
  PainelEmpty,
  PainelSkeleton,
} from "@/components/crm/dashboard/painel-block";
import { TipScope, tipText } from "@/components/crm/dashboard/chart-tip";
import { SegmentedToggle } from "@/components/crm/dashboard/segmented-toggle";
import { StatList } from "@/components/crm/dashboard/stat-list";
import { teamBlockPending } from "@/components/crm/dashboard/painel-team";
import { formatNumber, textMatchesQuery } from "@/features/dashboard-v2/format";
import { MEASURE_COLOR } from "@/features/dashboard-v2/measure-colors";
import type {
  PainelBlock,
  PainelTransferFlow,
  PainelTransfers,
} from "@/features/dashboard-v2/painel-api";
import { shareLabel, teamSubtitle } from "@/features/dashboard-v2/team-rankings";
import {
  OTHER_NODE_ID,
  layoutFlows,
  linkPath,
  roundTripRoutes,
  routeKey,
  sankeyGeometry,
  topNode,
  type FlowLink,
  type FlowNode,
  type SankeyGeometry,
} from "@/features/dashboard-v2/transfer-flow";
import { useElementWidth } from "@/hooks/use-element-width";
import { cn } from "@/lib/utils";

type Mode = "people" | "departments";

type Hover =
  | { kind: "link"; key: string }
  | { kind: "node"; side: "from" | "to"; id: string }
  | null;

const TOP_ROUTES = 8;
const COLOR = MEASURE_COLOR.transfers;

function short(name: string, max = 24): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

export function TransfersWidget({
  block,
  search,
  filtered,
  notice,
  onRetry,
}: {
  block: PainelBlock<PainelTransfers> | undefined;
  search: string;
  filtered: boolean;
  notice?: string | null;
  onRetry: () => void;
}) {
  const [mode, setMode] = useState<Mode>("people");
  const [hover, setHover] = useState<Hover>(null);
  const { ref: flowRef, width: flowWidth } = useElementWidth<HTMLDivElement>(720);
  const geo = useMemo(() => sankeyGeometry(flowWidth), [flowWidth]);

  const set = block?.ok ? block.data[mode] : null;
  const flows = useMemo<PainelTransferFlow[]>(
    () =>
      (set?.flows ?? [])
        .filter((f) => textMatchesQuery(f.from.name, search) || textMatchesQuery(f.to.name, search))
        .sort((a, b) => b.count - a.count),
    [set, search],
  );
  const layout = useMemo(
    () => layoutFlows(flows, { maxNodes: 7, rowHeight: 44, gap: 16, minHeight: 220 }),
    [flows],
  );
  const roundTrips = useMemo(() => roundTripRoutes(flows), [flows]);

  if (teamBlockPending(block)) return <PainelSkeleton className="min-h-[300px]" />;
  if (!block!.ok) return <PainelBlockError message={block!.error} onRetry={onRetry} />;

  const total = flows.reduce((acc, f) => acc + f.count, 0);
  // Com busca, a soma por rota é o melhor que dá (uma conversa pode estar em 2 rotas).
  const conversations = search.trim()
    ? Math.min(total, flows.reduce((acc, f) => acc + f.conversations, 0))
    : (set?.conversations ?? 0);

  const noun = mode === "people" ? "atendente" : "departamento";
  const topFrom = topNode(flows, "from");
  const topTo = topNode(flows, "to");
  const routes = flows.slice(0, TOP_ROUTES);
  const routeMax = Math.max(1, ...routes.map((r) => r.count));
  const topKey = flows[0] ? routeKey(flows[0].from.id, flows[0].to.id) : null;

  const linkLit = (l: FlowLink): boolean | null => {
    if (!hover) return null;
    if (hover.kind === "link") return hover.key === routeKey(l.fromId, l.toId);
    return hover.side === "from" ? l.fromId === hover.id : l.toId === hover.id;
  };
  const nodeLit = (side: "from" | "to", id: string): boolean | null => {
    if (!hover) return null;
    if (hover.kind === "node") return hover.side === side && hover.id === id;
    const link = layout.links.find((l) => routeKey(l.fromId, l.toId) === hover.key);
    if (!link) return null;
    return (side === "from" ? link.fromId : link.toId) === id;
  };

  return (
    <PainelCard
      title="Transferências de conversas"
      subtitle={teamSubtitle("De quem para quem as conversas foram passadas no período", {
        filtered,
        notice,
      })}
      info={
        mode === "people"
          ? "Troca de responsável entre atendentes humanos com a conversa em andamento. Não conta a primeira atribuição, a passagem da IA para humano nem a remoção do responsável."
          : "Troca de departamento da conversa feita pela ação Transferir. Com filtro de departamento, entra a rota que sai ou chega nele; com filtro de usuário, quem fez a transferência."
      }
      wrapAction
      action={
        <SegmentedToggle
          label="Ver por"
          value={mode}
          onChange={(next) => {
            setMode(next);
            setHover(null);
          }}
          options={[
            { value: "people", label: "Pessoas" },
            { value: "departments", label: "Departamentos" },
          ]}
        />
      }
    >
      {total === 0 ? (
        <PainelEmpty
          embedded
          title="Nenhuma transferência no período"
          description={
            mode === "people"
              ? "Nenhuma conversa mudou de atendente neste recorte."
              : "Nenhuma conversa mudou de departamento neste recorte."
          }
        />
      ) : (
        <TipScope>
          <StatList
            ariaLabel="Totais de transferências"
            items={[
              { label: "Transferências", value: formatNumber(total) },
              {
                label: "Conversas transferidas",
                value: formatNumber(conversations),
                hint: total > conversations ? "algumas passaram mais de uma vez" : undefined,
              },
              {
                label: "Mais transferiu",
                value: topFrom ? short(topFrom.name, 22) : "—",
                hint: topFrom
                  ? `${formatNumber(topFrom.total)} · ${shareLabel(topFrom.total, total)}`
                  : undefined,
              },
              {
                label: "Mais recebeu",
                value: topTo ? short(topTo.name, 22) : "—",
                hint: topTo
                  ? `${formatNumber(topTo.total)} · ${shareLabel(topTo.total, total)}`
                  : undefined,
              },
            ]}
          />

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            {/* Fluxo */}
            <div className="min-w-0">
              <p className="mb-1.5 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <span>De ({noun})</span>
                <span>Para ({noun})</span>
              </p>
              <div
                ref={flowRef}
                className="w-full overflow-x-auto"
                onMouseLeave={() => setHover(null)}
              >
                <svg
                  viewBox={`0 0 ${geo.width} ${layout.height}`}
                  width={geo.width}
                  height={layout.height}
                  data-sankey={geo.compact ? "compact" : "wide"}
                  className="mx-auto block h-auto max-w-full"
                  role="img"
                  aria-label={`Fluxo de transferências por ${noun}. O detalhe está na lista de principais rotas.`}
                >
                  <g>
                    {layout.links.map((l) => {
                      const key = routeKey(l.fromId, l.toId);
                      return (
                        <LinkBand
                          key={key}
                          geo={geo}
                          link={l}
                          top={key === topKey}
                          lit={linkLit(l)}
                          tip={tipText(
                            `${l.fromName} → ${l.toName}`,
                            `${formatNumber(l.count)} ${l.count === 1 ? "transferência" : "transferências"} · ${shareLabel(l.count, total)}`,
                            `${formatNumber(l.conversations)} ${l.conversations === 1 ? "conversa" : "conversas"}`,
                            roundTrips.has(key) && "Tem rota de volta",
                          )}
                          onEnter={() => setHover({ kind: "link", key })}
                        />
                      );
                    })}
                  </g>
                  {layout.sources.map((n) => (
                    <NodeMark
                      key={`s-${n.id}`}
                      geo={geo}
                      node={n}
                      side="from"
                      total={total}
                      lit={nodeLit("from", n.id)}
                      onEnter={() => setHover({ kind: "node", side: "from", id: n.id })}
                    />
                  ))}
                  {layout.targets.map((n) => (
                    <NodeMark
                      key={`t-${n.id}`}
                      geo={geo}
                      node={n}
                      side="to"
                      total={total}
                      lit={nodeLit("to", n.id)}
                      onEnter={() => setHover({ kind: "node", side: "to", id: n.id })}
                    />
                  ))}
                </svg>
              </div>
            </div>

            {/* Principais rotas */}
            <div className="min-w-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Principais rotas
              </p>
              <ol aria-label="Principais rotas de transferência">
                {routes.map((r, i) => {
                  const key = routeKey(r.from.id, r.to.id);
                  const inDiagram = layout.links.some(
                    (l) => routeKey(l.fromId, l.toId) === key,
                  );
                  const lit = hover?.kind === "link" && hover.key === key;
                  const light = () => (inDiagram ? setHover({ kind: "link", key }) : undefined);
                  return (
                    <li
                      key={key}
                      tabIndex={0}
                      onMouseEnter={light}
                      onFocus={light}
                      onMouseLeave={() => setHover(null)}
                      onBlur={() => setHover(null)}
                      className={cn(
                        "grid grid-cols-[1.1rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 rounded-md border-b border-border/60 px-1 py-1.5 last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      )}
                      style={lit ? { background: `color-mix(in oklch, ${COLOR} 10%, transparent)` } : undefined}
                    >
                      <span className="text-center text-[11px] font-semibold tabular-nums text-muted-foreground">
                        {i + 1}
                      </span>
                      <p
                        className="min-w-0 truncate text-[13px] font-semibold"
                        title={`${r.from.name} → ${r.to.name}`}
                      >
                        {r.from.name}
                        <em className="mx-1.5 font-normal not-italic text-muted-foreground">→</em>
                        {r.to.name}
                        {roundTrips.has(key) ? (
                          <span
                            className="ml-1.5 rounded-full border border-border px-1.5 text-[10px] font-semibold text-muted-foreground"
                            title="Existe a rota inversa"
                          >
                            ⇄ ida e volta
                          </span>
                        ) : null}
                      </p>
                      <span className="text-right text-[13px] font-semibold tabular-nums">
                        {formatNumber(r.count)}
                      </span>
                      <div
                        className="relative col-span-2 col-start-2 h-1.5 rounded-xs bg-secondary"
                        aria-hidden
                      >
                        <div
                          className="absolute inset-y-0 left-0 min-w-[3px] rounded-xs"
                          style={{ width: `${(r.count / routeMax) * 100}%`, background: COLOR }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ol>
              {flows.length > TOP_ROUTES ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  +{formatNumber(flows.length - TOP_ROUTES)} rotas menores
                </p>
              ) : null}
            </div>
          </div>
        </TipScope>
      )}
    </PainelCard>
  );
}

function LinkBand({
  geo,
  link,
  top,
  lit,
  tip,
  onEnter,
}: {
  geo: SankeyGeometry;
  link: FlowLink;
  top: boolean;
  lit: boolean | null;
  tip: string;
  onEnter: () => void;
}) {
  const other = link.fromId === OTHER_NODE_ID || link.toId === OTHER_NODE_ID;
  // Rota principal mais forte; ao passar o mouse, só a faixa acesa fica forte.
  const opacity = lit === null ? (top ? 0.5 : other ? 0.12 : 0.24) : lit ? 0.66 : 0.07;
  return (
    <path
      d={linkPath(link, geo.x0, geo.x1)}
      fill={other ? "var(--muted-foreground)" : COLOR}
      fillOpacity={opacity}
      stroke="var(--card)"
      strokeWidth={1}
      data-tip={tip}
      className="cursor-pointer transition-[fill-opacity] duration-150"
      onMouseEnter={onEnter}
    />
  );
}

function NodeMark({
  geo,
  node,
  side,
  total,
  lit,
  onEnter,
}: {
  geo: SankeyGeometry;
  node: FlowNode;
  side: "from" | "to";
  total: number;
  lit: boolean | null;
  onEnter: () => void;
}) {
  const other = node.id === OTHER_NODE_ID;
  const barX = side === "from" ? geo.x0 - geo.barW : geo.x1;
  const cy = node.y + node.h / 2;
  const textX = side === "from" ? barX - 8 : barX + geo.barW + 8;
  const counts = `${formatNumber(node.total)} · ${shareLabel(node.total, total)}`;
  return (
    <g
      className="cursor-pointer"
      onMouseEnter={onEnter}
      opacity={lit === false ? 0.45 : 1}
      style={{ transition: "opacity 150ms" }}
      data-tip={tipText(
        node.name,
        `${side === "from" ? "Transferiu" : "Recebeu"} ${formatNumber(node.total)} · ${shareLabel(node.total, total)}`,
      )}
    >
      {/* área de hover maior que a barra */}
      <rect
        x={side === "from" ? 0 : barX}
        y={node.y - 4}
        width={geo.labelW + geo.barW + 8}
        height={Math.max(node.h + 8, 20)}
        fill="transparent"
      />
      <title>{node.name}</title>
      <rect
        x={barX}
        y={node.y}
        width={geo.barW}
        height={Math.max(2, node.h)}
        rx={2}
        fill={other ? "var(--muted-foreground)" : COLOR}
      />
      {geo.compact ? (
        // Estreito: nome e contagem empilhados, cada lado dentro da sua coluna.
        <>
          <text
            x={textX}
            y={cy - 7}
            textAnchor={side === "from" ? "end" : "start"}
            dominantBaseline="central"
            className="fill-foreground"
            style={{ fontSize: 12, fontWeight: 600 }}
          >
            {short(node.name, geo.nameChars)}
          </text>
          <text
            x={textX}
            y={cy + 7}
            textAnchor={side === "from" ? "end" : "start"}
            dominantBaseline="central"
            className="fill-muted-foreground"
            style={{ fontSize: 10.5 }}
          >
            {counts}
          </text>
        </>
      ) : (
        <text
          x={textX}
          y={cy}
          textAnchor={side === "from" ? "end" : "start"}
          dominantBaseline="central"
          className="fill-foreground"
          style={{ fontSize: 12, fontWeight: 600 }}
        >
          {short(node.name, geo.nameChars)}
          <tspan className="fill-muted-foreground" style={{ fontSize: 11, fontWeight: 400 }} dx={6}>
            {counts}
          </tspan>
        </text>
      )}
    </g>
  );
}
