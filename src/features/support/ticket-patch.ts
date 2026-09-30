import type { SupportTicket, SupportTicketStatus } from "./types";

/**
 * Parte pura do realtime do suporte: lê o payload dos eventos SSE
 * (`support_ticket_updated`, `support_message`) e aplica o patch nas
 * listas de tickets em cache, sem refetch.
 */

/** Janela do throttle da invalidação de `[support-tickets]`. */
export const SUPPORT_INVALIDATE_THROTTLE_MS = 2_000;

export type SupportTicketPatch = {
  ticketId: string;
  status?: SupportTicketStatus;
  assignedToId?: string | null;
  number?: number;
  lastMessageAt?: string;
};

const STATUSES: readonly SupportTicketStatus[] = ["OPEN", "PENDING", "RESOLVED"];

/**
 * Extrai o patch do payload publicado pelo backend
 * (`publishTicketEvent` / `support_message`). `null` sem `ticketId`.
 */
export function readSupportTicketPatch(raw: unknown): SupportTicketPatch | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as {
    ticketId?: unknown;
    status?: unknown;
    assignedToId?: unknown;
    number?: unknown;
    message?: { createdAt?: unknown } | null;
  };
  if (typeof p.ticketId !== "string" || !p.ticketId) return null;
  const patch: SupportTicketPatch = { ticketId: p.ticketId };
  if (typeof p.status === "string" && (STATUSES as readonly string[]).includes(p.status)) {
    patch.status = p.status as SupportTicketStatus;
  }
  if (typeof p.assignedToId === "string" || p.assignedToId === null) {
    patch.assignedToId = p.assignedToId;
  }
  if (typeof p.number === "number") patch.number = p.number;
  const createdAt = p.message?.createdAt;
  if (typeof createdAt === "string" && createdAt) patch.lastMessageAt = createdAt;
  return patch;
}

/**
 * Aplica o patch na lista. Devolve a MESMA referência quando o ticket não
 * está nela ou nada mudou (React Query não re-renderiza os observadores).
 * `assignedTo` (objeto) só é zerado quando `assignedToId` vira `null`;
 * um novo responsável chega pelo refetch throttled.
 */
export function applySupportTicketPatch<T extends SupportTicket>(
  list: T[] | undefined,
  patch: SupportTicketPatch,
): T[] | undefined {
  if (!Array.isArray(list)) return list;
  const idx = list.findIndex((t) => t.id === patch.ticketId);
  if (idx < 0) return list;
  const cur = list[idx];
  const next: T = { ...cur };
  let changed = false;
  if (patch.status !== undefined && patch.status !== cur.status) {
    next.status = patch.status;
    if (patch.status === "RESOLVED") {
      if (!cur.resolvedAt) next.resolvedAt = new Date().toISOString();
    } else if (cur.resolvedAt) {
      next.resolvedAt = null;
    }
    changed = true;
  }
  if (patch.assignedToId !== undefined && patch.assignedToId !== cur.assignedToId) {
    next.assignedToId = patch.assignedToId;
    if (patch.assignedToId === null) next.assignedTo = null;
    else if (cur.assignedTo && cur.assignedTo.id !== patch.assignedToId) {
      next.assignedTo = null;
    }
    changed = true;
  }
  if (patch.number !== undefined && patch.number !== cur.number) {
    next.number = patch.number;
    changed = true;
  }
  if (patch.lastMessageAt && patch.lastMessageAt > (cur.lastMessageAt ?? "")) {
    next.lastMessageAt = patch.lastMessageAt;
    changed = true;
  }
  if (!changed) return list;
  const out = list.slice();
  out[idx] = next;
  return out;
}

/**
 * Throttle com borda inicial e final: a 1ª chamada roda na hora, as demais
 * dentro da janela viram UMA execução ao fim dela. Diferente do throttle
 * "descarta dentro da janela": rajada de eventos nunca perde a última.
 */
export function createLeadingTrailingThrottle(
  fn: () => void,
  windowMs: number,
  now: () => number = Date.now,
): { call: () => void; cancel: () => void } {
  let last = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = () => {
    last = now();
    fn();
  };
  return {
    call() {
      const elapsed = now() - last;
      if (elapsed >= windowMs) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        run();
        return;
      }
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        run();
      }, windowMs - elapsed);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
