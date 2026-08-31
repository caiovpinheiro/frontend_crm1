"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useRef } from "react";

export type SSEHandler = (event: string, data: unknown) => void;

/**
 * Barramento SSE singleton (P1-1): UMA conexão `EventSource` por URL,
 * compartilhada por todos os consumidores da página. Cada assinante
 * registra os eventos que lhe interessam e recebe `(event, data)` já
 * parseado — o `new EventSource` existe só aqui.
 *
 * Ciclo de vida por ref-count: a conexão abre no primeiro assinante e
 * fecha quando o último sai. Na prática ela vive a sessão inteira porque
 * o shell autenticado (`(app)/layout.tsx` → `SystemPresenceHeartbeat`)
 * é um assinante permanente. O close é adiado 1 tick para absorver o
 * duplo mount/unmount de efeitos do StrictMode sem derrubar a conexão.
 *
 * Reconexão: `onerror` fecha e reconecta em 5s (mesmo backoff fixo que
 * cada consumidor tinha quando abria a própria conexão).
 */

/** Eventos entregues por padrão aos assinantes do `useSSE` (compat). */
const DEFAULT_EVENTS: readonly string[] = [
  "new_message",
  "message_status",
  "conversation_updated",
  "contact_updated",
  "whatsapp_call",
  "presence_update",
  "system_presence_update",
];

const RECONNECT_DELAY_MS = 5_000;

class SharedSSEConnection {
  private es: EventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly attached = new Set<string>();
  private readonly subscribers = new Map<SSEHandler, ReadonlySet<string>>();

  constructor(private readonly url: string) {}

  subscribe(events: Iterable<string>, handler: SSEHandler): () => void {
    this.subscribers.set(handler, new Set(events));
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (this.es) {
      this.attachMissing();
    } else if (!this.retryTimer) {
      // Reconexão já agendada: o connect() dela anexa a união dos eventos.
      this.connect();
    }
    return () => this.unsubscribe(handler);
  }

  private unsubscribe(handler: SSEHandler): void {
    this.subscribers.delete(handler);
    if (this.subscribers.size > 0) {
      this.pruneListeners();
      return;
    }
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (this.subscribers.size === 0) this.teardown();
    }, 0);
  }

  private connect(): void {
    if (this.es) return;
    const es = new EventSource(this.url, { withCredentials: true });
    this.es = es;
    this.attachMissing();
    es.onerror = () => {
      es.close();
      if (this.es === es) this.es = null;
      this.attached.clear();
      if (this.retryTimer || this.subscribers.size === 0) return;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, RECONNECT_DELAY_MS);
    };
  }

  private teardown(): void {
    this.es?.close();
    this.es = null;
    this.attached.clear();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private attachMissing(): void {
    if (!this.es) return;
    for (const name of this.allEventNames()) {
      if (this.attached.has(name)) continue;
      this.es.addEventListener(name, this.dispatch);
      this.attached.add(name);
    }
  }

  private pruneListeners(): void {
    if (!this.es) return;
    const needed = this.allEventNames();
    for (const name of this.attached) {
      if (needed.has(name)) continue;
      this.es.removeEventListener(name, this.dispatch);
      this.attached.delete(name);
    }
  }

  private allEventNames(): Set<string> {
    const names = new Set<string>();
    for (const events of this.subscribers.values()) {
      for (const name of events) names.add(name);
    }
    return names;
  }

  private readonly dispatch = (e: Event): void => {
    let data: unknown;
    try {
      data = JSON.parse((e as MessageEvent).data as string);
    } catch {
      // Payload inválido: entrega `undefined` em vez de pular o evento —
      // handlers que ignoram o payload (ex.: conversation_updated) devem
      // rodar mesmo assim; os demais falham no acesso e caem no try/catch.
      data = undefined;
    }
    for (const [handler, events] of this.subscribers) {
      if (!events.has(e.type)) continue;
      try {
        handler(e.type, data);
      } catch {
        /* isola um assinante dos demais */
      }
    }
  };
}

const connections = new Map<string, SharedSSEConnection>();

function connectionFor(url: string): SharedSSEConnection {
  let conn = connections.get(url);
  if (!conn) {
    conn = new SharedSSEConnection(url);
    connections.set(url, conn);
  }
  return conn;
}

/**
 * Assina eventos na conexão compartilhada da `url`. Retorna unsubscribe.
 * Para uso dentro de `useEffect` (não é hook).
 */
export function subscribeSSE(
  url: string,
  events: Iterable<string>,
  handler: SSEHandler,
): () => void {
  return connectionFor(apiUrl(url)).subscribe(events, handler);
}

/**
 * Variante por mapa `{ evento: handler }` — substitui sequências de
 * `es.addEventListener("x", fn)` com uma única assinatura no barramento.
 */
export function subscribeSSEEvents(
  url: string,
  handlers: Record<string, (data: unknown) => void>,
): () => void {
  return subscribeSSE(url, Object.keys(handlers), (event, data) => {
    handlers[event]?.(data);
  });
}

export function useSSE(url: string, handler: SSEHandler, enabled = true) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    return subscribeSSE(url, DEFAULT_EVENTS, (event, data) => {
      handlerRef.current(event, data);
    });
  }, [url, enabled]);
}
