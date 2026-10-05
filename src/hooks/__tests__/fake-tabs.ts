/**
 * Navegador falso para testes de coordenação entre abas: um "hub" por
 * teste com `BroadcastChannel` falso (entrega assíncrona, sem eco para
 * quem enviou, clone por JSON) e Web Locks falso (fila FIFO por nome;
 * fechar/travar a aba libera o lock). Cada `FakeTab` tem os seus
 * `EventSource`s, visibilidade e ciclo de vida (`pagehide`).
 */
import type { PresenceEnv } from "../presence-sync";
import type { PresenceTickerEnv } from "../presence-ticker";
import {
  TabCoordinator,
  type TabChannelLike,
  type TabEnv,
  type TabLocksLike,
} from "../tab-coordinator";
import type { EventSourceLike, SseEnv } from "../use-sse";

export class FakeEventSource implements EventSourceLike {
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private readonly listeners = new Map<string, Set<(e: Event) => void>>();

  constructor(readonly url: string) {}
  addEventListener(name: string, fn: (e: Event) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn);
  }
  removeEventListener(name: string, fn: (e: Event) => void) {
    this.listeners.get(name)?.delete(fn);
  }
  listens(name: string): boolean {
    return (this.listeners.get(name)?.size ?? 0) > 0;
  }
  close() {
    this.closed = true;
  }
  open() {
    this.onopen?.();
  }
  fail() {
    this.onerror?.();
  }
  emit(name: string, data: unknown) {
    if (this.closed) throw new Error(`emit em EventSource fechado (${name})`);
    for (const fn of this.listeners.get(name) ?? []) {
      fn({ type: name, data: JSON.stringify(data) } as unknown as Event);
    }
  }
}

class FakeChannel implements TabChannelLike {
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  closed = false;
  constructor(
    private readonly hub: FakeTabHub,
    readonly name: string,
    readonly tabId: string,
  ) {
    hub.channels.add(this);
  }
  postMessage(message: unknown) {
    if (this.closed || this.hub.tabs.get(this.tabId)?.frozen) return;
    this.hub.deliver(this, message);
  }
  close() {
    this.closed = true;
    this.hub.channels.delete(this);
  }
}

type LockWaiter = {
  tabId: string;
  cb: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
};

const abortError = (msg: string) => Object.assign(new Error(msg), { name: "AbortError" });

class FakeLockManager {
  private readonly held = new Map<string, LockWaiter>();
  private readonly queue = new Map<string, LockWaiter[]>();

  forTab(tabId: string): TabLocksLike {
    return {
      request: (name, opts, cb) =>
        new Promise<void>((resolve, reject) => {
          const waiter: LockWaiter = { tabId, cb, resolve, reject };
          if (!this.queue.has(name)) this.queue.set(name, []);
          const queue = this.queue.get(name)!;
          if (opts.signal) {
            if (opts.signal.aborted) return reject(abortError("aborted"));
            opts.signal.addEventListener("abort", () => {
              const i = queue.indexOf(waiter);
              if (i < 0) return; // já concedido: o abort não solta o lock
              queue.splice(i, 1);
              reject(abortError("aborted"));
            });
          }
          if (opts.steal) {
            // Como no browser: quem segurava perde o lock (promise rejeitada).
            const current = this.held.get(name);
            if (current) {
              this.held.delete(name);
              current.reject(abortError("stolen"));
            }
            queue.unshift(waiter);
          } else {
            queue.push(waiter);
          }
          this.grantNext(name);
        }),
    };
  }

  private grantNext(name: string) {
    if (this.held.has(name)) return;
    const next = this.queue.get(name)?.shift();
    if (!next) return;
    this.held.set(name, next);
    // Como no browser: a concessão é assíncrona.
    setTimeout(() => {
      if (this.held.get(name) !== next) return;
      void next.cb().then(
        () => this.release(name, next),
        () => this.release(name, next),
      );
    }, 0);
  }

  private release(name: string, waiter: LockWaiter) {
    if (this.held.get(name) !== waiter) return;
    this.held.delete(name);
    waiter.resolve();
    this.grantNext(name);
  }

  /** Aba fechou/travou: solta o que detinha e sai das filas. */
  dropTab(tabId: string) {
    for (const [name, waiter] of [...this.held]) {
      if (waiter.tabId === tabId) this.release(name, waiter);
    }
    for (const [name, list] of this.queue) {
      this.queue.set(
        name,
        list.filter((w) => w.tabId !== tabId),
      );
    }
  }

  holder(name: string): string | null {
    return this.held.get(name)?.tabId ?? null;
  }
}

export class FakeTabHub {
  /** `localStorage` do navegador (compartilhado entre as abas). */
  readonly storage = new Map<string, string>();
  readonly channels = new Set<FakeChannel>();
  readonly locks = new FakeLockManager();
  readonly tabs = new Map<string, FakeTab>();

  deliver(from: FakeChannel, message: unknown) {
    const data = JSON.parse(JSON.stringify(message)) as unknown;
    for (const ch of [...this.channels]) {
      if (ch === from || ch.name !== from.name || ch.closed) continue;
      setTimeout(() => {
        if (!ch.closed && !this.tabs.get(ch.tabId)?.frozen) ch.onmessage?.({ data });
      }, 0);
    }
  }

  /**
   * Entrega uma mensagem crua a todas as abas do canal — simula uma aba
   * de fora (ex.: uma líder de termo maior que estas ainda não conheciam).
   */
  inject(channelName: string, message: unknown) {
    const data = JSON.parse(JSON.stringify(message)) as unknown;
    for (const ch of [...this.channels]) {
      if (ch.name !== channelName || ch.closed) continue;
      setTimeout(() => {
        if (!ch.closed) ch.onmessage?.({ data });
      }, 0);
    }
  }

  tab(id: string, opts: { locks?: boolean } = {}): FakeTab {
    const t = new FakeTab(this, id, opts.locks ?? true);
    this.tabs.set(id, t);
    return t;
  }
}

export class FakeTab {
  readonly eventSources: FakeEventSource[] = [];
  readonly channels: FakeChannel[] = [];
  hidden = false;
  /**
   * Aba congelada/estrangulada: não manda nem recebe nada pelo canal (o
   * lock continua com ela). Os timers dela seguem no relógio falso, mas o
   * que postam não chega a ninguém.
   */
  frozen = false;
  private lifecycle: { hide: () => void; show: () => void } | null = null;
  private readonly visibilityHandlers = new Set<() => void>();
  private readonly userActiveHandlers = new Set<() => void>();
  closed = false;

  constructor(
    readonly hub: FakeTabHub,
    readonly id: string,
    readonly locksEnabled: boolean,
  ) {}

  env(): TabEnv {
    return {
      tabId: this.id,
      createChannel: (name) => {
        const ch = new FakeChannel(this.hub, name, this.id);
        this.channels.push(ch);
        return ch;
      },
      locks: this.locksEnabled ? this.hub.locks.forTab(this.id) : null,
      random: () => 0.5,
      isVisible: () => !this.hidden,
      lifecycle: (handlers) => {
        this.lifecycle = handlers;
        return () => {
          this.lifecycle = null;
        };
      },
    };
  }

  coordinator(name = "crm"): TabCoordinator {
    return new TabCoordinator(name, this.env());
  }

  sseEnv(tabs: TabCoordinator | null, extras: Partial<SseEnv> = {}): SseEnv {
    return {
      createEventSource: (url) => {
        const es = new FakeEventSource(url);
        this.eventSources.push(es);
        return es;
      },
      tabs,
      random: () => 0.5,
      onUserActive: (fn) => {
        this.userActiveHandlers.add(fn);
        return () => this.userActiveHandlers.delete(fn);
      },
      ...extras,
    };
  }

  /** Usuário voltou a esta aba (foco / visível). */
  userActive() {
    for (const fn of this.userActiveHandlers) fn();
  }

  presenceEnv(
    tabs: TabCoordinator | null,
    io: {
      heartbeat: PresenceEnv["heartbeat"];
      leave: PresenceEnv["leave"];
    },
  ): PresenceEnv {
    return {
      tabs,
      heartbeat: io.heartbeat,
      leave: io.leave,
      isHidden: () => this.hidden,
      onVisibilityChange: (fn) => {
        this.visibilityHandlers.add(fn);
        return () => this.visibilityHandlers.delete(fn);
      },
    };
  }

  presenceTickerEnv(
    tabs: TabCoordinator | null,
    io: Pick<PresenceTickerEnv, "ping" | "activity">,
  ): PresenceTickerEnv {
    const key = "bwipo:presence:last-tick";
    return {
      tabs,
      ping: io.ping,
      activity: io.activity,
      readLastTick: () => {
        const raw = this.hub.storage.get(key);
        return raw ? Number(raw) : null;
      },
      writeLastTick: (at) => {
        this.hub.storage.set(key, String(at));
      },
      isVisible: () => !this.hidden,
      onVisibilityChange: (fn) => {
        this.visibilityHandlers.add(fn);
        return () => this.visibilityHandlers.delete(fn);
      },
    };
  }

  /** Último EventSource criado por esta aba. */
  get es(): FakeEventSource {
    const es = this.eventSources[this.eventSources.length - 1];
    if (!es) throw new Error(`aba ${this.id} sem EventSource`);
    return es;
  }

  get liveEventSources(): FakeEventSource[] {
    return this.eventSources.filter((es) => !es.closed);
  }

  setHidden(hidden: boolean) {
    this.hidden = hidden;
    for (const fn of this.visibilityHandlers) fn();
  }

  /** Fechar a aba: `pagehide` (bye + solta o lock) e canais fechados. */
  close() {
    if (this.closed) return;
    this.closed = true;
    this.lifecycle?.hide();
    this.hub.locks.dropTab(this.id);
    for (const ch of this.channels) ch.close();
  }

  /** Travar: sem `pagehide` — só o browser recolhe lock e canais. */
  crash() {
    if (this.closed) return;
    this.closed = true;
    this.hub.locks.dropTab(this.id);
    for (const ch of this.channels) ch.close();
  }
}
