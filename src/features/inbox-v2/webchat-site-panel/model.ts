/**
 * Painel "No site agora" — tipos, leitura da API e funções puras de
 * apresentação/atualização. Contrato: `GET /api/conversations/:id/webchat-context`
 * e os eventos SSE `webchat_context`/`webchat_event`
 * (backend: docs/decisoes/webchat-widget.md §9.3).
 *
 * Nada fixo de cliente: chaves e valores são do site; o rótulo vem da config
 * do canal (sem rótulo, mostra a chave).
 */
import { apiUrl } from "@/lib/api";
import type {
  RealtimePayload,
  WebchatSiteValue,
} from "@/lib/realtime-contract";

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

/** O evento SSE é do contato/canal deste painel? */
function samePanel(
  panel: WebchatSitePanelData,
  ev: { contactId?: string; channelId?: string },
): boolean {
  return (
    panel.available &&
    !!panel.contactId &&
    ev.contactId === panel.contactId &&
    ev.channelId === panel.channelId
  );
}

/** `webchat_context`: troca o estado inteiro (o backend manda o estado completo). */
export function applyWebchatContextEvent(
  panel: WebchatSitePanelData,
  ev: RealtimePayload<"webchat_context">,
): WebchatSitePanelData {
  if (!samePanel(panel, ev) || !ev.state || typeof ev.updatedAt !== "string") return panel;
  // Evento atrasado (mais velho que o gravado) não volta o painel no tempo.
  if (panel.context && Date.parse(ev.updatedAt) < Date.parse(panel.context.updatedAt)) return panel;
  return { ...panel, context: { state: ev.state, updatedAt: ev.updatedAt } };
}

/** `webchat_event`: entra na lista (sem repetir), mais recentes primeiro, até o teto. */
export function applyWebchatSiteEvent(
  panel: WebchatSitePanelData,
  ev: RealtimePayload<"webchat_event">,
): WebchatSitePanelData {
  const e = ev.event;
  if (!samePanel(panel, ev) || !e || typeof e.id !== "string") return panel;
  if (panel.events.some((x) => x.id === e.id)) return panel;
  const events = [
    {
      id: e.id,
      name: e.name,
      data: e.data ?? null,
      important: !!e.important,
      occurredAt: e.occurredAt,
    },
    ...panel.events,
  ]
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
    .slice(0, WEBCHAT_PANEL_EVENTS);
  return { ...panel, events };
}
