"use client";

/*
 * Painel "No site agora" (webchat v2) ao lado da conversa no inbox: o estado
 * atual que o site mandou (`setContext`) como chave → valor, com rótulos da
 * config do canal (sem rótulo, a chave), e os últimos eventos (`track`) com
 * quanto tempo faz. Texto neutro: o significado das chaves é do site.
 * Sem nada enviado pelo site, o painel não aparece.
 */
import { IconChevronDown, IconWorld } from "@tabler/icons-react";
import { useEffect, useId, useState } from "react";

import { cn } from "@/lib/utils";

import {
  formatSiteRelativeTime,
  formatSiteValue,
  siteKeyLabel,
  type WebchatSitePanelData,
} from "./model";
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
  const [open, setOpen] = useState(defaultOpen);
  if (!data?.available) return null;
  const entries = Object.entries(data.context?.state ?? {});
  if (entries.length === 0 && data.events.length === 0) return null;

  return (
    <section
      aria-labelledby={titleId}
      className="mx-2 mb-2 mt-2 min-w-0 shrink-0 rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-2.5"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left"
      >
        <IconWorld size={16} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
        <span id={titleId} className="font-display text-sm font-bold text-[var(--text-primary)]">
          No site agora
        </span>
        {data.context ? (
          <span className="ml-auto text-xs text-[var(--text-muted)]">
            {formatSiteRelativeTime(data.context.updatedAt, now)}
          </span>
        ) : null}
        <IconChevronDown
          size={12}
          aria-hidden
          className={cn("shrink-0 transition-transform", !data.context && "ml-auto", !open && "-rotate-90")}
        />
      </button>

      {open ? (
        <div className="mt-2 max-h-72 space-y-3 overflow-y-auto">
          {entries.length > 0 ? (
            <dl className="space-y-1">
              {entries.map(([key, value]) => (
                <div key={key} className="flex min-w-0 gap-2 text-xs">
                  <dt className="w-2/5 shrink-0 truncate text-[var(--text-muted)]" title={key}>
                    {siteKeyLabel(key, data.labels)}
                  </dt>
                  <dd className="min-w-0 flex-1 break-words text-[var(--text-primary)]">
                    {formatSiteValue(value)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}

          {data.events.length > 0 ? (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-[var(--text-muted)]">Últimos eventos</p>
              <ol className="space-y-1.5" aria-label="Últimos eventos no site">
                {data.events.map((ev) => {
                  const details = Object.entries(ev.data ?? {});
                  return (
                    <li key={ev.id} className="min-w-0 text-xs">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <span className="truncate font-mono text-[var(--text-primary)]">{ev.name}</span>
                        {ev.important ? (
                          <span className="shrink-0 rounded-[var(--radius-sm)] border border-[var(--glass-border)] px-1 text-[10px] font-semibold text-[var(--brand-primary)]">
                            importante
                          </span>
                        ) : null}
                        <time dateTime={ev.occurredAt} className="ml-auto shrink-0 text-[var(--text-muted)]">
                          {formatSiteRelativeTime(ev.occurredAt, now)}
                        </time>
                      </div>
                      {details.length > 0 ? (
                        <p className="break-words text-[var(--text-muted)]">
                          {details
                            .map(([k, v]) => `${siteKeyLabel(k, data.labels)}: ${formatSiteValue(v)}`)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
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
  return <WebchatSitePanelView data={data} now={now} />;
}
