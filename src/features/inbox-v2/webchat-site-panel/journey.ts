/**
 * Resumo da jornada no site (painel "No site agora") — funções puras:
 * destaque do último evento importante, estado atual em chips e caminho
 * recente (eventos não importantes, do mais antigo ao mais novo). Nada
 * fixo de cliente: rótulos da config do canal ou a chave legível.
 */
import type { WebchatSiteValue } from "@/lib/realtime-contract";

import { formatSiteValue, siteKeyLabel, type WebchatPanelEvent } from "./model";
import { describeSiteEvent, isTextualSiteValue, otherDetailsText, primaryDetailText } from "./timeline";

/** Chips do estado visíveis antes do "+N" (uma linha). */
export const WEBCHAT_PANEL_STATE_CHIPS = 3;
/** Passos do caminho visíveis antes do "+N anteriores". */
export const WEBCHAT_PANEL_PATH_STEPS = 4;

// ── Destaque ────────────────────────────────────────────────────────────

export type SiteHighlight = {
  id: string;
  title: string;
  primary: string | null;
  /** Demais dados em uma linha ("Rótulo: valor · …"), ou "". */
  others: string;
  /** ISO */
  occurredAt: string;
  /** Quantas vezes o mesmo evento importante aconteceu hoje (na lista). */
  todayCount: number;
};

function sameLocalDay(a: number, b: number): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return (
    x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate()
  );
}

/** Último evento importante (lista mais recente primeiro), ou `null`. */
export function siteHighlight(
  events: WebchatPanelEvent[],
  labels: Record<string, string>,
  now: number,
): SiteHighlight | null {
  const latest = events.find((e) => e.important);
  if (!latest) return null;
  const view = describeSiteEvent(latest, labels);
  const todayCount = events.filter((e) => {
    if (!e.important || e.name !== latest.name) return false;
    const t = Date.parse(e.occurredAt);
    return !Number.isNaN(t) && sameLocalDay(t, now);
  }).length;
  return {
    id: latest.id,
    title: view.title,
    primary: view.primary ? primaryDetailText(view.primary) : null,
    others: otherDetailsText(view.others),
    occurredAt: latest.occurredAt,
    todayCount,
  };
}

// ── Onde está (estado em chips) ─────────────────────────────────────────

export type SiteStateChip = {
  key: string;
  /** Texto do chip: o valor (texto que se explica) ou "Rótulo: valor". */
  text: string;
  /** Tooltip: sempre "Rótulo: valor" completo. */
  title: string;
};

export function siteStateChips(
  state: Record<string, WebchatSiteValue>,
  labels: Record<string, string>,
): SiteStateChip[] {
  const seen = new Set<string>();
  const chips: SiteStateChip[] = [];
  for (const [key, raw] of Object.entries(state)) {
    const value = formatSiteValue(raw).trim();
    if (!value) continue;
    const textual = isTextualSiteValue(raw, value);
    if (textual) {
      // Mesmo texto em duas chaves (ex.: título repetido) = um chip só.
      if (seen.has(value)) continue;
      seen.add(value);
    }
    const label = siteKeyLabel(key, labels);
    chips.push({ key, text: textual ? value : `${label}: ${value}`, title: `${label}: ${value}` });
  }
  return chips;
}

// ── Caminho ─────────────────────────────────────────────────────────────

export type SitePathStep = {
  /** id do evento mais recente do passo. */
  id: string;
  text: string;
  /** Texto completo para o tooltip ("Título · detalhe"). */
  title: string;
  count: number;
};

export type SitePath = {
  /** Do mais antigo ao mais novo. */
  steps: SitePathStep[];
  /** ISO do evento mais antigo do caminho, ou `null` sem passos. */
  since: string | null;
};

/**
 * Eventos não importantes do mais antigo ao mais novo; cada passo é o
 * detalhe principal (sem detalhe, o nome legível). Repetidos em sequência
 * viram um passo "×N".
 */
export function sitePath(events: WebchatPanelEvent[], labels: Record<string, string>): SitePath {
  const ordinary = events.filter((e) => !e.important).reverse();
  const steps: SitePathStep[] = [];
  for (const ev of ordinary) {
    const view = describeSiteEvent(ev, labels);
    const text = view.primary ? primaryDetailText(view.primary) : view.title;
    const prev = steps[steps.length - 1];
    if (prev && prev.text === text) {
      prev.count += 1;
      prev.id = ev.id;
      continue;
    }
    steps.push({ id: ev.id, text, title: view.primary ? `${view.title} · ${text}` : text, count: 1 });
  }
  return { steps, since: ordinary[0]?.occurredAt ?? null };
}

/** "últimos 5 min", "último minuto", "últimas 2 h", "últimos 3 dias". */
export function formatSitePathSpan(sinceIso: string, now: number): string {
  const t = Date.parse(sinceIso);
  if (Number.isNaN(t)) return "";
  const min = Math.max(1, Math.ceil((now - t) / 60_000));
  if (min <= 1) return "último minuto";
  if (min < 60) return `últimos ${min} min`;
  const h = Math.ceil(min / 60);
  if (h < 24) return `últimas ${h} h`;
  const d = Math.ceil(h / 24);
  return `últimos ${d} dias`;
}

/** Instante mais recente entre o estado e os eventos (cabeçalho "há X"). */
export function latestSiteActivity(updatedAt: string | null, events: WebchatPanelEvent[]): string | null {
  const times = [updatedAt, ...events.map((e) => e.occurredAt)]
    .filter((v): v is string => !!v)
    .map((v) => [v, Date.parse(v)] as const)
    .filter(([, t]) => !Number.isNaN(t));
  if (times.length === 0) return null;
  return times.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
}
