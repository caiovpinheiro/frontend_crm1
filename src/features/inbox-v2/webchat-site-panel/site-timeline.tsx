"use client";

/*
 * Linha do tempo do painel do site: eventos (`track`) numa linha vertical
 * com marcadores, título legível, detalhe principal, demais dados em texto
 * discreto e o tempo relativo à direita. Eventos iguais em sequência viram
 * uma linha "×N". Importante = destaque âmbar, ícone de alerta e selo
 * "importante". Mostra `WEBCHAT_PANEL_TIMELINE_ROWS` linhas + "ver mais".
 */
import { IconAlertTriangle } from "@tabler/icons-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatSiteRelativeTime, WEBCHAT_PANEL_TIMELINE_ROWS, type WebchatPanelEvent } from "./model";
import { groupSiteEvents, otherDetailsText, primaryDetailText, type SiteTimelineRow } from "./timeline";

function TimelineMarker({ important }: { important: boolean }) {
  if (important) {
    return (
      <IconAlertTriangle
        size={12}
        stroke={2.25}
        aria-hidden
        className="absolute left-0 top-0.5 text-warning"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="absolute left-[2px] top-1 size-2 rounded-full bg-muted-foreground/50 ring-2 ring-card"
    />
  );
}

function TimelineItem({ row, now, last }: { row: SiteTimelineRow; now: number; last: boolean }) {
  const others = otherDetailsText(row.others);
  const primary = row.primary ? primaryDetailText(row.primary) : null;
  return (
    <li className={cn("relative pl-5", !last && "pb-2")}>
      {!last ? (
        <span aria-hidden className="absolute -bottom-1 left-[5.5px] top-3 w-px bg-muted-foreground/25" />
      ) : null}
      <TimelineMarker important={row.important} />
      <div
        className={cn(
          "min-w-0 rounded-md",
          row.important && "-mx-1 border-l-2 border-warning bg-warning-soft px-1.5 py-0.5",
        )}
      >
        {/* Aside estreito: selos e horário quebram para a linha de baixo
            antes de cortar o título. */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-4">
          <span className="max-w-full truncate font-semibold text-foreground" title={row.title}>
            {row.title}
          </span>
          {row.count > 1 ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              <span aria-hidden>×{row.count}</span>
              <span className="sr-only">, {row.count} vezes</span>
            </span>
          ) : null}
          {row.important ? (
            <Badge variant="warning" className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold">
              importante
            </Badge>
          ) : null}
          <time
            dateTime={row.occurredAt}
            title={new Date(row.occurredAt).toLocaleString("pt-BR")}
            className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums text-muted-foreground"
          >
            {formatSiteRelativeTime(row.occurredAt, now)}
          </time>
        </div>
        {primary ? (
          <p className="truncate text-xs leading-4 text-foreground/80" title={primary}>
            {primary}
          </p>
        ) : null}
        {others ? (
          <p className="truncate text-[11px] leading-4 text-muted-foreground" title={others}>
            {others}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function SiteTimeline({
  events,
  labels,
  now,
}: {
  events: WebchatPanelEvent[];
  labels: Record<string, string>;
  now: number;
}) {
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => groupSiteEvents(events, labels), [events, labels]);
  if (rows.length === 0) return null;
  const extra = rows.length - WEBCHAT_PANEL_TIMELINE_ROWS;
  const visible = showAll || extra <= 0 ? rows : rows.slice(0, WEBCHAT_PANEL_TIMELINE_ROWS);

  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
        Linha do tempo
      </p>
      <ol id={listId} aria-label="Últimos eventos no site">
        {visible.map((row, i) => (
          <TimelineItem key={row.id} row={row} now={now} last={i === visible.length - 1} />
        ))}
      </ol>
      {extra > 0 ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          aria-expanded={showAll}
          aria-controls={listId}
          onClick={() => setShowAll((v) => !v)}
          className="mt-1 h-6 px-0 text-xs"
        >
          {showAll ? "ver menos" : `ver mais (+${extra})`}
        </Button>
      ) : null}
    </div>
  );
}
