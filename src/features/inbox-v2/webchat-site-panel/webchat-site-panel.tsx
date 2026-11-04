"use client";

/*
 * Painel "No site agora" (webchat v2) ao lado da conversa no inbox, feito
 * para o atendente entender a situação de relance, de cima para baixo:
 * "Situação" (chaves reservadas do `setContext` — selo, frase, progresso —
 * e o último evento importante com a mensagem do visitante), "Última
 * localização" (demais chaves do estado, uma linha) e, recolhido em "Ver o
 * que fez no site", o caminho e o histórico.
 * Rótulos da config do canal (sem rótulo, a chave legível). Texto neutro:
 * o significado das chaves é do site. Cada bloco sem dados some; sem nada
 * enviado pelo site, o painel não aparece.
 */
import { IconChevronDown, IconWorld } from "@tabler/icons-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { latestSiteActivity, siteHighlight, sitePath, siteStateChips, siteStatus } from "./journey";
import { formatSiteRelativeTime, type WebchatSitePanelData } from "./model";
import { SitePathChips, SiteStateChips, SiteStatusCard } from "./site-journey";
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
const EMPTY_STATE: NonNullable<WebchatSitePanelData["context"]>["state"] = {};

/** Caminho + histórico, recolhidos: o atendente abre quando quer investigar. */
function SiteActivity({
  count,
  defaultOpen,
  children,
}: {
  count: number;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="min-w-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-0 items-center gap-1 rounded-md text-xs font-medium leading-5 text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <IconChevronDown
          size={14}
          aria-hidden
          className={cn("shrink-0 transition-transform", !open && "-rotate-90")}
        />
        {open ? "Ocultar o que fez no site" : `Ver o que fez no site (${count})`}
      </button>
      {open ? (
        <div id={bodyId} className="mt-2 space-y-3">
          {children}
        </div>
      ) : null}
    </div>
  );
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
  const events = data?.events ?? EMPTY_EVENTS;
  const labels = data?.labels ?? EMPTY_LABELS;
  const state = data?.context?.state ?? EMPTY_STATE;
  const status = useMemo(() => siteStatus(state), [state]);
  const chips = useMemo(() => siteStateChips(state, labels), [state, labels]);
  const path = useMemo(() => sitePath(events, labels), [events, labels]);
  const highlight = siteHighlight(events, labels, now);
  // O evento do destaque não se repete no histórico.
  const historyEvents = useMemo(
    () => (highlight ? events.filter((e) => e.id !== highlight.id) : events),
    [events, highlight],
  );

  if (!data?.available) return null;
  const hasState = Object.keys(state).length > 0;
  if (!hasState && events.length === 0) return null;
  const last = latestSiteActivity(hasState ? (data.context?.updatedAt ?? null) : null, events);
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
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <IconWorld size={14} aria-hidden />
        </span>
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
          className="scrollbar-thin max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain px-3 pb-3"
        >
          <SiteStatusCard status={status} highlight={highlight} />
          <SiteStateChips chips={chips} />
          {historyEvents.length > 0 ? (
            // Sem situação nem localização, a atividade é tudo o que há: já abre.
            <SiteActivity
              count={historyEvents.length}
              defaultOpen={!highlight && !status.summary && !status.status && chips.length === 0}
            >
              <SitePathChips path={path} now={now} />
              <SiteTimeline events={historyEvents} labels={labels} now={now} />
            </SiteActivity>
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
