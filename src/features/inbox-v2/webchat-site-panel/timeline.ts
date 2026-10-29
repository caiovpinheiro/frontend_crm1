/**
 * Linha do tempo do painel "No site agora" — funções puras: título legível
 * do evento, detalhe principal + demais dados, e agrupamento de eventos
 * repetidos em sequência ("Tela aberta ×3"). Nada fixo de cliente: o
 * detalhe principal é o primeiro valor que o site mandou.
 */
import type { WebchatSiteValue } from "@/lib/realtime-contract";

import { formatSiteValue, siteKeyLabel, type WebchatPanelEvent } from "./model";

export type SiteEventDetail = {
  key: string;
  label: string;
  value: string;
  /** Valor de texto (com letra): sozinho já se explica, sem o rótulo. */
  textual: boolean;
};

export type SiteEventView = {
  title: string;
  /** Primeiro valor do `data` (sem rótulo), ou `null` sem dados. */
  primary: SiteEventDetail | null;
  /** Demais dados (rótulo: valor), sem texto repetido do principal/outros. */
  others: SiteEventDetail[];
};

export type SiteTimelineRow = SiteEventView & {
  /** id do evento mais recente do grupo (chave estável da linha). */
  id: string;
  count: number;
  important: boolean;
  /** ISO do evento mais recente do grupo. */
  occurredAt: string;
};

/** Construtor: o `target` ES2017 do tsconfig não aceita `\p{…}` literal. */
const HAS_LETTER = new RegExp("\\p{L}", "u");

/** Texto com letra repetido de outra chave = mesmo dado; número/booleano não. */
function isDedupable(value: WebchatSiteValue, text: string): boolean {
  return typeof value === "string" && HAS_LETTER.test(text);
}

export function describeSiteEvent(
  event: Pick<WebchatPanelEvent, "name" | "data">,
  labels: Record<string, string>,
): SiteEventView {
  const seen = new Set<string>();
  const details: SiteEventDetail[] = [];
  for (const [key, raw] of Object.entries(event.data ?? {})) {
    const value = formatSiteValue(raw).trim();
    if (!value) continue;
    const textual = isDedupable(raw, value);
    if (textual) {
      if (seen.has(value)) continue;
      seen.add(value);
    }
    details.push({ key, label: siteKeyLabel(key, labels), value, textual });
  }
  const [primary = null, ...others] = details;
  return { title: siteKeyLabel(event.name, labels), primary, others };
}

/**
 * Agrupa eventos consecutivos (lista mais recente primeiro) com o mesmo
 * nome e o mesmo detalhe principal numa linha `count`, com o horário do
 * mais recente. Importante se algum do grupo for.
 */
export function groupSiteEvents(
  events: WebchatPanelEvent[],
  labels: Record<string, string>,
): SiteTimelineRow[] {
  const rows: SiteTimelineRow[] = [];
  let lastKey: string | null = null;
  for (const ev of events) {
    const view = describeSiteEvent(ev, labels);
    const key = `${ev.name}\u0000${view.primary?.value ?? ""}`;
    const prev = rows[rows.length - 1];
    if (prev && key === lastKey) {
      prev.count += 1;
      prev.important = prev.important || ev.important;
      continue;
    }
    rows.push({ ...view, id: ev.id, count: 1, important: ev.important, occurredAt: ev.occurredAt });
    lastKey = key;
  }
  return rows;
}

/** Detalhe principal na linha: texto sozinho; número/booleano com o rótulo. */
export function primaryDetailText(detail: SiteEventDetail): string {
  return detail.textual ? detail.value : `${detail.label}: ${detail.value}`;
}

/** Demais dados numa linha: "Rótulo: valor · Rótulo: valor". */
export function otherDetailsText(details: SiteEventDetail[]): string {
  return details.map((d) => `${d.label}: ${d.value}`).join(" · ");
}
