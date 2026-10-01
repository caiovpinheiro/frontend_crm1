"use client";

import { apiUrl } from "@/lib/api";
import { useEffect, useRef, useSyncExternalStore } from "react";

import {
  tabCoordinatorFor,
  type TabCoordinator,
  type TabEnvelope,
} from "./tab-coordinator";

export type SSEHandler = (event: string, data: unknown) => void;
export type SSEReconnectHandler = () => void;

/**
 * Barramento SSE singleton (P1-1): UMA conexão `EventSource` por URL,
 * compartilhada por todos os consumidores da página. Cada assinante
 * registra os eventos que lhe interessam e recebe `(event, data)` já
 * parseado — o `new EventSource` existe só aqui.
 *
 * Uma conexão por NAVEGADOR (MA-1): entre abas da mesma origem só a aba
 * líder (`tab-coordinator.ts`: Web Locks, com fallback por batimentos no
 * `BroadcastChannel`) abre o `EventSource`; cada evento é retransmitido
 * pelo canal e as seguidoras entregam aos seus assinantes como se fosse
 * local. As seguidoras informam à líder os eventos que precisam (`state`),
 * e a líder anexa a união — um evento que ninguém pede não é nem
 * parseado. Se a líder fecha, a próxima assume em < 2s e abre a conexão
 * dela; os assinantes das seguidoras recebem `onReconnect` (houve gap).
 * A API pública (`useSSE`, `subscribeSSE*`) não muda.
 *
 * Ciclo de vida por ref-count: a conexão abre no primeiro assinante (desta
 * aba ou de uma seguidora) e fecha 30s depois que o último sai. Trocar de
 * tela (inbox → board) desmonta um assinante e monta outro: a tela
 * seguinte reaproveita a mesma conexão, sem reconectar nem recarregar
 * dados (e o duplo mount/unmount do StrictMode também não derruba).
 *
 * Aba oculta NÃO derruba a conexão: aviso sonoro, contador e Notification
 * de nova mensagem existem para funcionar em segundo plano, e o stream não
 * tem replay — o que chega com a conexão fechada é perdido para sempre.
 *
 * Reconexão: `onerror` fecha e reconecta com backoff exponencial e jitter
 * (5s, 10s, 20s… até 60s, ±30%), zerado a cada open. Fixo em 5s, um deploy
 * derrubava todas as abas e elas voltavam juntas (cada conexão monta o
 * gate de visibilidade no backend), e sessão expirada batia 401 a cada 5s
 * para sempre. Reabrir depois de um gap dispara `onReconnect`
 * (inbox/pipeline reidratam).
 */

/**
 * Eventos entregues por padrão aos assinantes do `useSSE` que não passam
 * uma lista própria (compat). Quem só precisa de 1–2 eventos deve passar a
 * lista: cada evento a mais é um parse + dispatch por mensagem da org.
 */
export const DEFAULT_SSE_EVENTS: readonly string[] = [
  "new_message",
  "message_status",
  "conversation_updated",
  "contact_updated",
  "whatsapp_call",
  "presence_update",
  "system_presence_update",
];

/** Último assinante saiu: tempo até fechar (a próxima tela reaproveita). */
export const SSE_IDLE_CLOSE_MS = 30_000;

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
const RECONNECT_JITTER = 0.3;

/** Espera da tentativa `attempt` (0 = primeira): exponencial + jitter. */
export function sseReconnectDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 2 - 1) * RECONNECT_JITTER;
  return Math.round(base * jitter);
}

export interface EventSourceLike {
  onopen: (() => void) | null;
  onerror: (() => void) | null;
  addEventListener(name: string, fn: (e: Event) => void): void;
  removeEventListener(name: string, fn: (e: Event) => void): void;
  close(): void;
}

/** Dependências do barramento — injetáveis nos testes (uma por "aba"). */
export interface SseEnv {
  createEventSource: (url: string) => EventSourceLike;
  /** `null` = aba isolada (sem coordenação; comportamento de uma conexão por aba). */
  tabs: TabCoordinator | null;
}

type StatusListener = (open: boolean) => void;

class SharedSSEConnection {
  private es: EventSourceLike | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly attached = new Set<string>();
  private readonly subscribers = new Map<SSEHandler, ReadonlySet<string>>();
  private readonly reconnectHandlers = new Set<SSEReconnectHandler>();
  private readonly statusListeners = new Set<StatusListener>();
  /** Eventos pedidos pelas seguidoras (cache; recalculado em `refresh`). */
  private followerNeeds = new Set<string>();
  /** Só dispara `onReconnect` depois de um open bem-sucedido + gap. */
  private everOpened = false;
  private sawGap = false;
  /** Falhas seguidas desde o último open (backoff). */
  private failures = 0;
  /** Estado da conexão como esta aba o conhece (própria ou da líder). */
  private open = false;

  constructor(
    readonly url: string,
    private readonly env: SseEnv,
  ) {}

  get connected(): boolean {
    return this.open;
  }

  private get tabs(): TabCoordinator | null {
    return this.env.tabs;
  }

  private isLeader(): boolean {
    return !this.tabs || this.tabs.role === "leader";
  }

  subscribe(
    events: Iterable<string>,
    handler: SSEHandler,
    onReconnect?: SSEReconnectHandler,
  ): () => void {
    this.subscribers.set(handler, new Set(events));
    if (onReconnect) this.reconnectHandlers.add(onReconnect);
    this.tabs?.scheduleStateSync();
    this.refresh();
    return () => this.unsubscribe(handler, onReconnect);
  }

  private unsubscribe(
    handler: SSEHandler,
    onReconnect?: SSEReconnectHandler,
  ): void {
    this.subscribers.delete(handler);
    if (onReconnect) this.reconnectHandlers.delete(onReconnect);
    this.tabs?.scheduleStateSync();
    this.refresh();
  }

  onStatus(fn: StatusListener): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  /** Eventos desta aba (para o `state` enviado à líder). */
  localEvents(): string[] {
    return [...this.allEventNames(this.subscribers)];
  }

  /**
   * Reconcilia o `EventSource` com o papel da aba e com quem precisa de
   * eventos (assinantes locais + seguidoras). Seguidora nunca abre conexão.
   */
  refresh(): void {
    if (!this.isLeader()) {
      this.teardown();
      return;
    }
    this.followerNeeds = this.collectFollowerNeeds();
    const needed = this.neededEvents();
    if (needed.size === 0) {
      this.scheduleIdleClose();
      return;
    }
    this.cancelIdleClose();
    if (this.es) {
      this.attachMissing(needed);
      this.pruneListeners(needed);
    } else if (!this.retryTimer) {
      // Reconexão já agendada: o connect() dela anexa a união dos eventos.
      this.connect();
    }
  }

  /** Esta aba virou líder (abre) ou seguidora (fecha a própria conexão). */
  onRoleChange(): void {
    if (this.isLeader()) {
      // Entre a queda da líder anterior e esta conexão houve um gap sem
      // replay: o open seguinte avisa os assinantes como reconexão.
      if (this.everOpened) this.sawGap = true;
    }
    this.refresh();
  }

  /** Seguidora: a líder mudou — o que a nova abrir é uma reconexão. */
  onLeaderChange(): void {
    if (this.isLeader()) return;
    if (this.everOpened) this.sawGap = true;
    this.setOpen(false, false);
  }

  /** Seguidora: estado da conexão da líder. */
  applyRemoteStatus(open: boolean): void {
    if (this.isLeader()) return;
    if (open === this.open) return;
    this.setOpen(open, false);
    if (open) {
      this.afterOpen();
    } else if (this.everOpened) {
      this.sawGap = true;
    }
  }

  /** Líder: reenvia o estado atual (uma seguidora nova acabou de se apresentar). */
  postStatus(): void {
    if (!this.tabs || !this.isLeader()) return;
    this.tabs.post({ t: "status", url: this.url, open: this.open });
  }

  /** Entrega local (evento da própria conexão ou retransmitido pela líder). */
  deliverLocal(event: string, data: unknown): void {
    for (const [handler, events] of this.subscribers) {
      if (!events.has(event)) continue;
      try {
        handler(event, data);
      } catch {
        /* isola um assinante dos demais */
      }
    }
  }

  private afterOpen(): void {
    const shouldNotify = this.everOpened && this.sawGap;
    this.everOpened = true;
    this.sawGap = false;
    if (!shouldNotify) return;
    for (const fn of this.reconnectHandlers) {
      try {
        fn();
      } catch {
        /* isola um assinante dos demais */
      }
    }
  }

  private setOpen(open: boolean, broadcast: boolean): void {
    if (this.open === open) return;
    this.open = open;
    for (const fn of this.statusListeners) {
      try {
        fn(open);
      } catch {
        /* isola */
      }
    }
    if (broadcast && this.tabs && this.isLeader()) {
      this.tabs.post({ t: "status", url: this.url, open });
    }
  }

  private collectFollowerNeeds(): Set<string> {
    const needs = new Set<string>();
    if (!this.tabs || this.tabs.role !== "leader") return needs;
    for (const entry of this.tabs.followerStates().values()) {
      for (const name of entry.state.sse?.[this.url] ?? []) needs.add(name);
    }
    return needs;
  }

  private neededEvents(): Set<string> {
    const needed = this.allEventNames(this.subscribers);
    for (const name of this.followerNeeds) needed.add(name);
    return needed;
  }

  private scheduleIdleClose(): void {
    if (this.closeTimer || !this.es) return;
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (this.neededEvents().size === 0) this.teardown();
    }, SSE_IDLE_CLOSE_MS);
  }

  private cancelIdleClose(): void {
    if (!this.closeTimer) return;
    clearTimeout(this.closeTimer);
    this.closeTimer = null;
  }

  private connect(): void {
    if (this.es) return;
    if (!this.isLeader() || this.neededEvents().size === 0) return;
    let es: EventSourceLike;
    try {
      es = this.env.createEventSource(this.url);
    } catch {
      // Sem `EventSource` (SSR, ambiente de teste sem browser): nada a abrir.
      return;
    }
    this.es = es;
    this.attachMissing(this.neededEvents());
    es.onopen = () => {
      this.failures = 0;
      this.setOpen(true, true);
      this.afterOpen();
    };
    es.onerror = () => {
      if (this.everOpened) this.sawGap = true;
      es.close();
      if (this.es === es) this.es = null;
      this.attached.clear();
      this.setOpen(false, true);
      if (this.retryTimer || this.neededEvents().size === 0) return;
      if (!this.isLeader()) return;
      const delay = sseReconnectDelayMs(this.failures);
      this.failures += 1;
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.connect();
      }, delay);
    };
  }

  private teardown(): void {
    this.cancelIdleClose();
    this.es?.close();
    this.es = null;
    this.attached.clear();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.isLeader()) this.setOpen(false, false);
  }

  private attachMissing(needed: Set<string>): void {
    if (!this.es) return;
    for (const name of needed) {
      if (this.attached.has(name)) continue;
      this.es.addEventListener(name, this.dispatch);
      this.attached.add(name);
    }
  }

  private pruneListeners(needed: Set<string>): void {
    if (!this.es) return;
    for (const name of this.attached) {
      if (needed.has(name)) continue;
      this.es.removeEventListener(name, this.dispatch);
      this.attached.delete(name);
    }
  }

  private allEventNames(subs: Map<SSEHandler, ReadonlySet<string>>): Set<string> {
    const names = new Set<string>();
    for (const events of subs.values()) {
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
    this.deliverLocal(e.type, data);
    if (this.tabs && this.followerNeeds.has(e.type)) {
      this.tabs.post({ t: "event", url: this.url, name: e.type, data });
    }
  };
}

/**
 * Conexões desta aba (uma por URL) ligadas ao coordenador de abas: roteia
 * as mensagens da líder (`event`/`status`) para a conexão certa e informa
 * à líder o que esta aba assina.
 */
export class SseTabBridge {
  private readonly connections = new Map<string, SharedSSEConnection>();
  private readonly offs: Array<() => void> = [];

  constructor(readonly env: SseEnv) {
    const tabs = env.tabs;
    if (!tabs) return;
    this.offs.push(
      tabs.registerStateProvider(() => {
        const sse: Record<string, string[]> = {};
        for (const conn of this.connections.values()) {
          const events = conn.localEvents();
          if (events.length > 0) sse[conn.url] = events;
        }
        return { sse };
      }),
      tabs.onRoleChange(() => {
        for (const conn of this.connections.values()) conn.onRoleChange();
      }),
      tabs.onLeaderChange(() => {
        for (const conn of this.connections.values()) conn.onLeaderChange();
      }),
      tabs.onFollowerStatesChange(() => {
        // Seguidora pode precisar de uma URL que esta aba ainda não tem.
        for (const entry of tabs.followerStates().values()) {
          for (const url of Object.keys(entry.state.sse ?? {})) this.connection(url);
        }
        for (const conn of this.connections.values()) conn.refresh();
      }),
      tabs.onMessage((msg: TabEnvelope) => {
        if (msg.t === "event") {
          this.connections.get(msg.url)?.deliverLocal(msg.name, msg.data);
        } else if (msg.t === "status") {
          this.connection(msg.url).applyRemoteStatus(msg.open);
        } else if (msg.t === "state") {
          // Seguidora nova: diz a ela como está a conexão.
          for (const url of Object.keys(msg.state.sse ?? {})) {
            this.connection(url).postStatus();
          }
        }
      }),
    );
  }

  connection(url: string): SharedSSEConnection {
    let conn = this.connections.get(url);
    if (!conn) {
      conn = new SharedSSEConnection(url, this.env);
      this.connections.set(url, conn);
    }
    return conn;
  }

  destroy(): void {
    while (this.offs.length) this.offs.pop()?.();
  }
}

let defaultBridge: SseTabBridge | null = null;

function bridge(): SseTabBridge {
  if (!defaultBridge) {
    defaultBridge = new SseTabBridge({
      createEventSource: (url) => new EventSource(url, { withCredentials: true }),
      tabs: tabCoordinatorFor("crm"),
    });
  }
  return defaultBridge;
}

/** Só para testes: troca o ambiente padrão (ou volta ao real com `null`). */
export function __setDefaultSseEnvForTests(env: SseEnv | null): void {
  defaultBridge?.destroy();
  defaultBridge = env ? new SseTabBridge(env) : null;
}

/**
 * No-op: a conexão não é mais derrubada com a aba oculta, então não há o
 * que segurar. Mantido para não mexer nos hooks de chamada WhatsApp, que
 * chamavam isto para garantir a sinalização com a aba em segundo plano.
 */
export function holdSSEWhileHidden(_url = "/api/sse/messages"): () => void {
  return () => {};
}

/**
 * Assina eventos na conexão compartilhada da `url`. Retorna unsubscribe.
 * Para uso dentro de `useEffect` (não é hook).
 */
export function subscribeSSE(
  url: string,
  events: Iterable<string>,
  handler: SSEHandler,
  onReconnect?: SSEReconnectHandler,
): () => void {
  return bridge().connection(apiUrl(url)).subscribe(events, handler, onReconnect);
}

/**
 * Variante por mapa `{ evento: handler }` — substitui sequências de
 * `es.addEventListener("x", fn)` com uma única assinatura no barramento.
 */
export function subscribeSSEEvents(
  url: string,
  handlers: Record<string, (data: unknown) => void>,
  onReconnect?: SSEReconnectHandler,
): () => void {
  return subscribeSSE(
    url,
    Object.keys(handlers),
    (event, data) => {
      handlers[event]?.(data);
    },
    onReconnect,
  );
}

/**
 * Estado da conexão SSE da `url` como esta aba o conhece: a própria
 * (líder) ou a da líder (seguidora). `false` até o primeiro open.
 */
export function subscribeSSEStatus(url: string, fn: StatusListener): () => void {
  return bridge().connection(apiUrl(url)).onStatus(fn);
}

export function isSSEConnected(url = "/api/sse/messages"): boolean {
  return bridge().connection(apiUrl(url)).connected;
}

/** `true` enquanto o stream SSE (desta aba ou da líder) está aberto. */
export function useSSEConnected(url = "/api/sse/messages"): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeSSEStatus(url, onChange),
    () => isSSEConnected(url),
    () => false,
  );
}

/**
 * Lista efetiva de eventos de um assinante do `useSSE`: a própria lista
 * (sem vazios/duplicados) ou, sem lista, os eventos padrão.
 */
export function resolveSSEEvents(
  events?: Iterable<string> | null,
): readonly string[] {
  if (!events) return DEFAULT_SSE_EVENTS;
  const list = Array.from(new Set(Array.from(events).filter((e) => e.trim())));
  return list.length > 0 ? list : DEFAULT_SSE_EVENTS;
}

/**
 * Assina a conexão compartilhada dentro de um componente. `events` limita
 * o que chega ao `handler` (ex.: `["whatsapp_call"]`); sem a lista, entrega
 * os `DEFAULT_SSE_EVENTS`. A identidade do array não importa — o efeito só
 * reassina quando o conteúdo muda.
 */
export function useSSE(
  url: string,
  handler: SSEHandler,
  enabled = true,
  events?: readonly string[],
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const eventsKey = resolveSSEEvents(events).join(",");

  useEffect(() => {
    if (!enabled) return;
    return subscribeSSE(url, eventsKey.split(","), (event, data) => {
      handlerRef.current(event, data);
    });
  }, [url, enabled, eventsKey]);
}
