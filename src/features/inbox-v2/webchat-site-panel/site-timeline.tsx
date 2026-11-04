"use client";

/*
 * Histórico do painel do site: eventos (`track`) numa linha vertical com
 * pontos, uma linha por evento (título e tempo relativo); o clique na linha
 * abre os dados do evento.
 * Eventos iguais em sequência viram uma linha "×N". Importante = ponto e
 * fundo âmbar. Mostra `WEBCHAT_PANEL_TIMELINE_ROWS` linhas + "ver mais".
 */
import { IconClock } from "@tabler/icons-react";
import { useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { formatSiteRelativeTime, WEBCHAT_PANEL_TIMELINE_ROWS, type WebchatPanelEvent } from "./model";
import { groupSiteEvents, otherDetailsText, primaryDetailText, type SiteTimelineRow } from "./timeline";

function TimelineItem({ row, now, last }: { row: SiteTimelineRow; now: number; last: boolean }) {
  const detailId = useId();
  const [open, setOpen] = useState(false);
  const primary = row.primary ? primaryDetailText(row.primary) : null;
  const others = otherDetailsText(row.others);
  const expandable = Boolean(primary || others);
  const line = (
    <>
      {row.important ? <span className="sr-only">Importante:</span> : null}
      <span className="min-w-0 truncate font-semibold text-foreground">{row.title}</span>
      {row.count > 1 ? (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
              <span aria-hidden>×{row.count}</span>
              <span className="sr-only">, {row.count} vezes</span>
            </span>
          ) : null}
      <time
        dateTime={row.occurredAt}
        title={new Date(row.occurredAt).toLocaleString("pt-BR")}
        className="ml-auto shrink-0 pl-1 text-[10px] tabular-nums text-muted-foreground"
      >
        {formatSiteRelativeTime(row.occurredAt, now)}
      </time>
    </>
  );
  const rowClass = "flex w-full min-w-0 items-center gap-1.5 px-2 py-1 text-left text-xs leading-4";
  return (
    <li className={cn("relative pl-5", !last && "pb-1")}>
      {!last ? (
        <span aria-hidden className="absolute -bottom-0.5 left-[4.5px] top-3.5 w-px bg-border" />
      ) : null}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-[9px] size-2.5 rounded-full ring-2 ring-card",
          row.important ? "bg-warning" : "bg-muted-foreground/40",
        )}
      />
      {/* Fechado = uma linha; o clique abre os dados do evento. */}
      <div className={cn("min-w-0 rounded-md", row.important && "bg-warning-soft")}>
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              rowClass,
              "rounded-md outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-primary/30",
            )}
          >
            {line}
          </button>
        ) : (
          <div className={rowClass}>{line}</div>
        )}
        {expandable && open ? (
          <div id={detailId} className="space-y-0.5 px-2 pb-1">
            {primary ? <p className="break-words text-[11px] leading-4 text-foreground/80">{primary}</p> : null}
            {others ? <p className="break-words text-[11px] leading-4 text-muted-foreground">{others}</p> : null}
          </div>
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
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground">
        <IconClock size={14} aria-hidden className="text-muted-foreground" />
        Histórico
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
