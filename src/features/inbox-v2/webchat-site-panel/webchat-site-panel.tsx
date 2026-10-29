"use client";

/*
 * Painel "No site agora" (webchat v2) ao lado da conversa no inbox:
 * cartão "Agora" com o estado atual que o site mandou (`setContext`) em
 * grade rótulo → valor, e a linha do tempo dos últimos eventos (`track`),
 * com repetidos agrupados e importantes em destaque. Rótulos da config do
 * canal (sem rótulo, a chave legível). Texto neutro: o significado das
 * chaves é do site. Sem nada enviado pelo site, o painel não aparece.
 */
import { IconChevronDown, IconWorld } from "@tabler/icons-react";
import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";

import { formatSiteRelativeTime, type WebchatSitePanelData } from "./model";
import { SiteNowGrid } from "./site-now-grid";
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
  const [open, setOpen] = useState(defaultOpen);
  if (!data?.available) return null;
  const state = data.context?.state ?? {};
  const hasState = Object.keys(state).length > 0;
  if (!hasState && data.events.length === 0) return null;
  const updated = hasState && data.context ? formatSiteRelativeTime(data.context.updatedAt, now) : "";

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
          {updated ? (
            <span className="truncate text-[11px] text-muted-foreground">
              · atualizado {updated}
            </span>
          ) : null}
        </span>
        <IconChevronDown
          size={14}
          aria-hidden
          className={cn("shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
        />
      </button>

      {open ? (
        <div id={bodyId} className="scrollbar-thin max-h-[60vh] space-y-3 overflow-y-auto overscroll-contain px-3 pb-3">
          {hasState ? <SiteNowGrid state={state} labels={data.labels} /> : null}
          <SiteTimeline events={data.events} labels={data.labels} now={now} />
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
