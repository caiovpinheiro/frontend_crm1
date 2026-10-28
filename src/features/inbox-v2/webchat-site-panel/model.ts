/**
 * Painel "No site agora" — tipos, leitura da API e funções puras de
 * apresentação. Contrato: `GET /api/conversations/:id/webchat-context` e os
 * sinais SSE `webchat_context`/`webchat_event` (sem valores; o painel refaz
 * o GET) — backend: docs/decisoes/webchat-widget.md §9.3.
 *
 * Nada fixo de cliente: chaves e valores são do site; o rótulo vem da config
 * do canal (sem rótulo, mostra a chave).
 */
import { apiUrl } from "@/lib/api";
import type { WebchatSiteValue } from "@/lib/realtime-contract";

/** Quantos eventos o painel mostra (o backend manda até 10). */
export const WEBCHAT_PANEL_EVENTS = 10;

export type WebchatPanelEvent = {
  id: string;
  name: string;
  data: Record<string, WebchatSiteValue> | null;
  important: boolean;
  /** ISO */
  occurredAt: string;
};

export type WebchatSitePanelData = {
  /** `false` = conversa fora do webchat: o painel não aparece. */
  available: boolean;
  contactId: string | null;
  channelId: string | null;
  labels: Record<string, string>;
  context: { state: Record<string, WebchatSiteValue>; updatedAt: string } | null;
  /** Mais recentes primeiro. */
  events: WebchatPanelEvent[];
};

export async function getWebchatSitePanel(conversationId: string): Promise<WebchatSitePanelData> {
  const res = await fetch(
    apiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/webchat-context`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar o contexto do site",
    );
  }
  return data as WebchatSitePanelData;
}

/** Rótulo da chave pela config do canal; sem rótulo, a própria chave. */
export function siteKeyLabel(key: string, labels: Record<string, string>): string {
  const label = labels[key];
  return typeof label === "string" && label.trim() ? label : key;
}

/** Valor como texto de uma linha. */
export function formatSiteValue(v: WebchatSiteValue): string {
  if (typeof v === "boolean") return v ? "sim" : "não";
  return String(v);
}

/** "agora", "há 3 min", "há 2 h", "há 4 dias". */
export function formatSiteRelativeTime(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.floor((now - t) / 1000));
  if (sec < 60) return "agora";
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

/**
 * O sinal SSE (`webchat_context`/`webchat_event`) é do contato/canal deste
 * painel? Os sinais não trazem valores: o painel refaz o GET (que confere o
 * acesso à conversa).
 */
export function isWebchatPanelSignal(
  panel: WebchatSitePanelData | undefined,
  ev: { contactId?: unknown; channelId?: unknown } | null | undefined,
): boolean {
  return (
    !!panel &&
    panel.available &&
    !!panel.contactId &&
    !!ev &&
    ev.contactId === panel.contactId &&
    ev.channelId === panel.channelId
  );
}
