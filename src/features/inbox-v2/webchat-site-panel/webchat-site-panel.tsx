"use client";

/*
 * Painel "No site agora" (webchat v2) ao lado da conversa no inbox, em
 * formato de resumo da jornada, de cima para baixo: destaque âmbar do
 * último evento importante, "Onde está" (estado atual do `setContext` em
 * chips, recolhido em uma linha), "Caminho" (eventos recentes não
 * importantes em sequência) e, sob demanda, a linha do tempo completa.
 * Rótulos da config do canal (sem rótulo, a chave legível). Texto neutro:
 * o significado das chaves é do site. Cada bloco sem dados some; sem nada
 * enviado pelo site, o painel não aparece.
 */
import { IconChevronDown, IconWorld } from "@tabler/icons-react";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { latestSiteActivity, siteHighlight, sitePath, siteStateChips } from "./journey";
import { formatSiteRelativeTime, type WebchatSitePanelData } from "./model";
import { SiteHighlightCard, SitePathChips, SiteStateChips } from "./site-journey";
import { SiteTimeline } from "./site-timeline";
import { useWebchatSitePanel } from "./use-webchat-site-panel";

/** De quanto em quanto tempo o "há N min" é recalculado. */
const RELATIVE_TICK_MS = 30_000;

function useNow(tickMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return now;
}

const EMPTY_EVENTS: WebchatSitePanelData["events"] = [];
const EMPTY_LABELS: Record<string, string> = {};

/** Visual puro (testável sem rede). `null` quando não há o que mostrar. */
export function WebchatSitePanelView({
  data,
  now,
  defaultOpen = true,
}: {
  data: WebchatSitePanelData | undefined;
  now: number;
  defaultOpen?: boolean;
}) {
  const titleId = useId();
  const bodyId = useId();
  const timelineId = useId();
  const [open, setOpen] = useState(defaultOpen);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const events = data?.events ?? EMPTY_EVENTS;
  const labels = data?.labels ?? EMPTY_LABELS;
  const state = data?.context?.state;
  const chips = useMemo(() => siteStateChips(state ?? {}, labels), [state, labels]);
  const path = useMemo(() => sitePath(events, labels), [events, labels]);
  const highlight = siteHighlight(events, labels, now);

  if (!data?.available) return null;
  if (chips.length === 0 && events.length === 0) return null;
  const last = latestSiteActivity(chips.length > 0 ? (data.context?.updatedAt ?? null) : null, events);
  const ago = last ? formatSiteRelativeTime(last, now) : "";

  return (
    <section
      aria-labelledby={titleId}
      className="mx-2 my-2 min-w-0 shrink-0 rounded-xl border border-border-soft bg-card shadow-[var(--shadow-card-sm)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={bodyId}
        className="flex w-full min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <IconWorld size={15} className="shrink-0 text-primary" aria-hidden />
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span id={titleId} className="shrink-0 font-display text-sm font-bold text-foreground">
            No site agora
          </span>
          {ago ? <span className="truncate text-[11px] text-muted-foreground">· {ago}</span> : null}
        </span>
        <IconChevronDown
          size={14}
          aria-hidden
          className={cn("shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open ? (
        <div
          id={bodyId}
          className="scrollbar-thin max-h-[60vh] space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-2.5"
        >
          {highlight ? <SiteHighlightCard highlight={highlight} now={now} /> : null}
          <SiteStateChips chips={chips} />
          <SitePathChips path={path} now={now} />
          {events.length > 0 ? (
            <div className="min-w-0">
              <Button
                type="button"
                variant="link"
                size="sm"
                aria-expanded={timelineOpen}
                aria-controls={timelineId}
                onClick={() => setTimelineOpen((v) => !v)}
                className="h-6 gap-1 px-0 text-xs"
              >
                {timelineOpen ? "Ocultar linha do tempo" : "Ver linha do tempo completa"}
                <IconChevronDown
                  aria-hidden
                  className={cn("transition-transform", timelineOpen && "rotate-180")}
                />
              </Button>
              {timelineOpen ? (
                <div id={timelineId} className="mt-1.5">
                  <SiteTimeline events={events} labels={labels} now={now} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Painel da conversa aberta (busca + SSE). */
export function WebchatSitePanel({ conversationId }: { conversationId: string | null }) {
  const { data } = useWebchatSitePanel(conversationId);
  const now = useNow(RELATIVE_TICK_MS);
  return <WebchatSitePanelView key={conversationId ?? ""} data={data} now={now} />;
}
