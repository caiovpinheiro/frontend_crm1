/**
 * Navegador falso para testes de coordenação entre abas: um "hub" por
 * teste com `BroadcastChannel` falso (entrega assíncrona, sem eco para
 * quem enviou, clone por JSON) e Web Locks falso (fila FIFO por nome;
 * fechar/travar a aba libera o lock). Cada `FakeTab` tem os seus
 * `EventSource`s, visibilidade e ciclo de vida (`pagehide`).
 */
import type { PresenceEnv } from "../presence-sync";
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
    if (this.closed) return;
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
};

class FakeLockManager {
  private readonly held = new Map<string, LockWaiter>();
  private readonly queue = new Map<string, LockWaiter[]>();

  forTab(tabId: string): TabLocksLike {
    return {
      request: (name, _opts, cb) =>
        new Promise<void>((resolve) => {
          const waiter: LockWaiter = { tabId, cb, resolve };
          if (!this.queue.has(name)) this.queue.set(name, []);
          this.queue.get(name)!.push(waiter);
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
  readonly channels = new Set<FakeChannel>();
  readonly locks = new FakeLockManager();
  readonly tabs = new Map<string, FakeTab>();

  deliver(from: FakeChannel, message: unknown) {
    const data = JSON.parse(JSON.stringify(message)) as unknown;
    for (const ch of [...this.channels]) {
      if (ch === from || ch.name !== from.name || ch.closed) continue;
      setTimeout(() => {
        if (!ch.closed) ch.onmessage?.({ data });
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
