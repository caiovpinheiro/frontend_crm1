"use client";

/*
 * Cartão "Agora" do painel do site: o último estado (`setContext`) como
 * grade rótulo → valor de duas colunas. Rótulo da config do canal ou a
 * chave legível; valor cortado com reticências e o texto inteiro no
 * `title`. Mostra até `WEBCHAT_PANEL_STATE_KEYS` chaves + "ver tudo".
 */
import { Fragment, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import type { WebchatSiteValue } from "@/lib/realtime-contract";

import { formatSiteValue, siteKeyLabel, WEBCHAT_PANEL_STATE_KEYS } from "./model";

export function SiteNowGrid({
  state,
  labels,
}: {
  state: Record<string, WebchatSiteValue>;
  labels: Record<string, string>;
}) {
  const listId = useId();
  const [showAll, setShowAll] = useState(false);
  const entries = Object.entries(state);
  if (entries.length === 0) return null;
  const extra = entries.length - WEBCHAT_PANEL_STATE_KEYS;
  const visible = showAll || extra <= 0 ? entries : entries.slice(0, WEBCHAT_PANEL_STATE_KEYS);

  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-2">
      <dl
        id={listId}
        aria-label="Estado atual no site"
        className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1 text-xs leading-4"
      >
        {visible.map(([key, raw]) => {
          const label = siteKeyLabel(key, labels);
          const value = formatSiteValue(raw);
          return (
            <Fragment key={key}>
              <dt className="truncate text-muted-foreground" title={label}>
                {label}
              </dt>
              <dd className="truncate font-medium text-foreground" title={value}>
                {value}
              </dd>
            </Fragment>
          );
        })}
      </dl>
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
          {showAll ? "ver menos" : `ver tudo (+${extra})`}
        </Button>
      ) : null}
    </div>
  );
}
