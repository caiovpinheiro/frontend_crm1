"use client";

/**
 * Coordenação entre abas do mesmo navegador (MA-1/MA-2): UMA aba é a
 * líder — mantém o `EventSource` do SSE e o heartbeat de presença — e as
 * demais (seguidoras) recebem tudo por `BroadcastChannel`.
 *
 * Eleição:
 *  - Com Web Locks (`navigator.locks`): lock exclusivo `crm:tabs:<nome>`.
 *    Quem o detém é líder; quando a aba fecha ou trava o browser libera o
 *    lock e a próxima da fila assume na hora (< 2s). A líder também emite
 *    `lead` a cada 5s: uma líder congelada/estrangulada segura o lock sem
 *    retransmitir nada, então uma seguidora VISÍVEL que fica 15s sem ouvir
 *    a líder rouba o lock (`steal`) e assume; a antiga, ao saber que
 *    perdeu o lock, vira seguidora e volta para a fila (N-MA-1).
 *  - Sem Web Locks: a líder emite `lead` a cada 500ms pelo canal; sem
 *    batimento por 1,5s uma seguidora reivindica (`claim`), espera 50–300ms
 *    por um `lead`/`claim` melhor (termo maior, depois menor tabId) e vira
 *    líder. Um `bye` da líder (pagehide) encurta a espera.
 *  - Sem `BroadcastChannel`: cada aba é líder de si mesma (comportamento
 *    anterior, uma conexão por aba).
 *
 * Termo (`term`) cresce a cada eleição e vai em toda mensagem: uma líder
 * antiga que acorda estrangulada e ainda retransmite é ignorada pelas
 * seguidoras (termo menor) e se afasta ao ouvir o `lead` novo.
 *
 * Estado das seguidoras: cada uma manda `state` (eventos SSE assinados por
 * URL e entidades de presença abertas) ao assinar/desassinar, ao ouvir um
 * `lead` novo e a cada 20s; a líder descarta estados sem renovação há 60s
 * (aba que morreu sem `bye`). O que a líder faz com isso fica em
 * `use-sse.ts` (eventos) e `presence-sync.ts` (heartbeat agregado).
 */

export type TabRole = "leader" | "follower";

export type TabState = {
  /** URL do SSE → eventos que esta aba precisa receber. */
  sse?: Record<string, string[]>;
  /** Chaves `entityType|entityId` das entidades abertas nesta aba. */
  presence?: string[];
};

export type TabMessage =
  | { t: "lead" }
  | { t: "claim" }
  | { t: "bye" }
  | { t: "state"; state: TabState }
  | { t: "event"; url: string; name: string; data: unknown }
  | { t: "status"; url: string; open: boolean }
  | { t: "viewers"; key: string; viewers: unknown };

export type TabEnvelope = TabMessage & { v: 1; from: string; term: number };

export interface TabChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface TabLocksLike {
  request(
    name: string,
    options: { mode: "exclusive"; steal?: boolean; signal?: AbortSignal },
    callback: () => Promise<void>,
  ): Promise<void>;
}

export interface TabEnv {
  tabId?: string;
  createChannel: (name: string) => TabChannelLike | null;
  locks: TabLocksLike | null;
  random?: () => number;
  /**
   * `pagehide` / `pageshow` (bfcache) da aba — devolve o unsubscribe. Ao
   * esconder, a aba solta a liderança na hora (`bye`); se voltar do
   * bfcache, entra de novo na eleição.
   */
  lifecycle?: (handlers: { hide: () => void; show: () => void }) => () => void;
  /** Aba visível? Só uma seguidora visível rouba a liderança. Padrão: sim. */
  isVisible?: () => boolean;
}

export const FALLBACK_HEARTBEAT_MS = 500;
export const FALLBACK_TIMEOUT_MS = 1_500;
/** Batimento da líder no modo Web Locks. */
export const LEADER_BEAT_MS = 5_000;
/** Seguidora sem ouvir a líder por este tempo rouba o lock. */
export const LEADER_STALE_MS = 15_000;
const LEADER_WATCH_MS = 2_000;
const CLAIM_WAIT_MIN_MS = 50;
const CLAIM_WAIT_SPREAD_MS = 250;
export const STATE_REFRESH_MS = 20_000;
export const STATE_TTL_MS = 60_000;
const STATE_SWEEP_MS = 30_000;

export type FollowerState = { state: TabState; seenAt: number };

let tabSeq = 0;
function newTabId(random: () => number): string {
  tabSeq += 1;
  return `${Date.now().toString(36)}-${Math.floor(random() * 0xffffff).toString(36)}-${tabSeq}`;
}

export class TabCoordinator {
  readonly tabId: string;
  private readonly channel: TabChannelLike | null;
  private readonly random: () => number;
  private roleValue: TabRole = "follower";
  private termValue = 0;
  private leaderIdValue: string | null = null;
  private destroyed = false;
  private usingLocks = false;
  private releaseLock: (() => void) | null = null;
  /** Pedido de lock em espera (abortado ao roubar). */
  private lockAbort: AbortController | null = null;
  /** Geração do pedido de lock: respostas de pedidos substituídos são ignoradas. */
  private lockGen = 0;
  /** Última mensagem da líder (modo Web Locks). */
  private leaderSeenAt = Date.now();
  private leaderWatchTimer: ReturnType<typeof setInterval> | null = null;

  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private timeoutTimer: ReturnType<typeof setTimeout> | null = null;
  private claimTimer: ReturnType<typeof setTimeout> | null = null;
  private claimTerm = 0;

  private readonly stateProviders = new Set<() => TabState>();
  private stateSyncTimer: ReturnType<typeof setTimeout> | null = null;
  private stateRefreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly followers = new Map<string, FollowerState>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  private readonly roleListeners = new Set<(role: TabRole) => void>();
  private readonly leaderListeners = new Set<(leaderId: string | null) => void>();
  private readonly messageListeners = new Set<(msg: TabEnvelope) => void>();
  private readonly followerListeners = new Set<() => void>();
  private readonly suspendListeners = new Set<(wasLeader: boolean) => void>();
  private readonly offLifecycle: (() => void) | null;
  private suspended = false;

  constructor(
    readonly name: string,
    private readonly env: TabEnv,
  ) {
    this.random = env.random ?? Math.random;
    this.tabId = env.tabId ?? newTabId(this.random);
    this.channel = env.createChannel(`crm:tabs:${name}`);
    this.offLifecycle = env.lifecycle
      ? env.lifecycle({ hide: () => this.suspend(), show: () => this.resume() })
      : null;

    if (!this.channel) {
      // Sem canal não há com quem coordenar: líder de si mesma.
      this.becomeLeader(1);
      return;
    }
    this.channel.onmessage = (ev) => this.handle(ev.data);
    this.enterElection();
    this.startFollowerDuties();
  }

  private enterElection(): void {
    if (this.env.locks) {
      this.usingLocks = true;
      this.startLocks(this.env.locks);
    } else {
      this.usingLocks = false;
      this.startFallback();
    }
  }

  /**
   * `pagehide`: solta a liderança já (lock + `bye`) para a próxima aba
   * assumir sem esperar o browser recolher a página. Fica como seguidora
   * sem líder; `resume()` (volta do bfcache) reentra na eleição.
   */
  suspend(): void {
    if (this.destroyed || this.suspended || !this.channel) return;
    this.suspended = true;
    const wasLeader = this.roleValue === "leader";
    // Antes de soltar a liderança: quem precisa despedir-se do servidor
    // (ex.: presença) ainda sabe o que as seguidoras reportavam.
    for (const fn of this.suspendListeners) {
      try {
        fn(wasLeader);
      } catch {
        /* isola */
      }
    }
    this.post({ t: "bye" });
    // Papel primeiro: quem reage à limpeza abaixo (estados das seguidoras
    // zerados) já precisa enxergar esta aba como seguidora — senão a
    // presença mandaria `leave`/join com base numa visão vazia.
    this.roleValue = "follower";
    this.stopLeaderDuties();
    this.stopFollowerDuties();
    this.cancelClaim();
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.stateSyncTimer) clearTimeout(this.stateSyncTimer);
    this.timeoutTimer = null;
    this.stateSyncTimer = null;
    this.dropLockRequest();
    this.releaseLock?.();
    this.releaseLock = null;
    this.setLeaderId(null);
    if (wasLeader) this.emitRole("follower");
  }

  resume(): void {
    if (this.destroyed || !this.suspended || !this.channel) return;
    this.suspended = false;
    this.enterElection();
    this.startFollowerDuties();
  }

  get role(): TabRole {
    return this.roleValue;
  }
  get term(): number {
    return this.termValue;
  }
  get leaderId(): string | null {
    return this.leaderIdValue;
  }
  get coordinated(): boolean {
    return this.channel !== null;
  }

  onRoleChange(fn: (role: TabRole) => void): () => void {
    this.roleListeners.add(fn);
    return () => this.roleListeners.delete(fn);
  }
  onLeaderChange(fn: (leaderId: string | null) => void): () => void {
    this.leaderListeners.add(fn);
    return () => this.leaderListeners.delete(fn);
  }
  /** Mensagens de aplicação (`event`, `status`, `viewers`, `state`). */
  onMessage(fn: (msg: TabEnvelope) => void): () => void {
    this.messageListeners.add(fn);
    return () => this.messageListeners.delete(fn);
  }
  onFollowerStatesChange(fn: () => void): () => void {
    this.followerListeners.add(fn);
    return () => this.followerListeners.delete(fn);
  }
  /** `pagehide`: chamado ANTES de soltar a liderança (`wasLeader`). */
  onSuspend(fn: (wasLeader: boolean) => void): () => void {
    this.suspendListeners.add(fn);
    return () => this.suspendListeners.delete(fn);
  }

  /** Estados conhecidos das seguidoras (só faz sentido na líder). */
  followerStates(): ReadonlyMap<string, FollowerState> {
    return this.followers;
  }

  post(msg: TabMessage): void {
    if (!this.channel || this.destroyed) return;
    const envelope: TabEnvelope = {
      ...msg,
      v: 1,
      from: this.tabId,
      term: this.termValue,
    };
    try {
      this.channel.postMessage(envelope);
    } catch {
      /* canal fechado */
    }
  }

  registerStateProvider(fn: () => TabState): () => void {
    this.stateProviders.add(fn);
    return () => this.stateProviders.delete(fn);
  }

  /** Seguidora: reenvia o próprio `state` à líder (coalescido no próximo tick). */
  scheduleStateSync(): void {
    if (!this.channel || this.destroyed) return;
    if (this.roleValue !== "follower") return;
    if (this.stateSyncTimer) return;
    this.stateSyncTimer = setTimeout(() => {
      this.stateSyncTimer = null;
      this.postState();
    }, 0);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.post({ t: "bye" });
    this.destroyed = true;
    this.offLifecycle?.();
    this.roleValue = "follower";
    this.stopLeaderDuties();
    this.stopFollowerDuties();
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    if (this.claimTimer) clearTimeout(this.claimTimer);
    if (this.stateSyncTimer) clearTimeout(this.stateSyncTimer);
    this.timeoutTimer = null;
    this.claimTimer = null;
    this.stateSyncTimer = null;
    this.dropLockRequest();
    this.releaseLock?.();
    this.releaseLock = null;
    this.channel?.close();
  }

  // ── Eleição ───────────────────────────────────────────────────────

  /** Invalida o pedido de lock atual (e tira da fila o que ainda espera). */
  private dropLockRequest(): void {
    this.lockGen += 1;
    this.lockAbort?.abort();
    this.lockAbort = null;
  }

  private startLocks(locks: TabLocksLike, steal = false): void {
    this.dropLockRequest();
    const gen = this.lockGen;
    const abort = steal || typeof AbortController === "undefined" ? null : new AbortController();
    this.lockAbort = abort;
    let granted = false;
    const options: { mode: "exclusive"; steal?: boolean; signal?: AbortSignal } = steal
      ? { mode: "exclusive", steal: true }
      : abort
        ? { mode: "exclusive", signal: abort.signal }
        : { mode: "exclusive" };
    void locks
      .request(`crm:tabs:${this.name}`, options, () => {
        if (this.destroyed || gen !== this.lockGen) return Promise.resolve();
        granted = true;
        if (this.lockAbort === abort) this.lockAbort = null;
        this.becomeLeader(this.termValue + 1);
        return new Promise<void>((resolve) => {
          this.releaseLock = resolve;
        });
      })
      .catch(() => {
        // Pedido substituído (roubo nosso, suspend, destroy): nada a fazer.
        if (this.destroyed || gen !== this.lockGen) return;
        if (granted) {
          // Outra aba roubou o lock (esta estava congelada/estrangulada):
          // deixa de ser líder e volta para a fila.
          if (this.roleValue === "leader") this.loseLeadership();
          this.startLocks(locks);
          return;
        }
        // API indisponível: cai no protocolo de batimentos.
        if (this.roleValue === "leader") return;
        this.usingLocks = false;
        this.startFallback();
      });
  }

  /** Seguidora visível sem ouvir a líder há `LEADER_STALE_MS`: rouba o lock. */
  private watchLeader(): void {
    if (this.destroyed || this.suspended || !this.usingLocks || !this.env.locks) return;
    if (this.roleValue === "leader") return;
    if (Date.now() - this.leaderSeenAt < LEADER_STALE_MS) return;
    if (this.env.isVisible && !this.env.isVisible()) return;
    this.leaderSeenAt = Date.now();
    this.startLocks(this.env.locks, true);
  }

  /** O lock foi roubado: seguidora sem líder conhecida (a nova se anuncia). */
  private loseLeadership(): void {
    this.roleValue = "follower";
    this.releaseLock = null;
    this.stopLeaderDuties();
    this.setLeaderId(null);
    this.startFollowerDuties();
    this.emitRole("follower");
    this.scheduleStateSync();
  }

  private startFallback(): void {
    // Aba recém-aberta não sabe se há líder: reivindica já. Se houver, a
    // líder responde `lead` e a reivindicação é cancelada (~300ms, em vez
    // de esperar 1,5s de silêncio para abrir a primeira conexão).
    this.startClaim(0);
  }

  private armTimeout(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer);
    this.timeoutTimer = setTimeout(() => {
      this.timeoutTimer = null;
      this.startClaim(0);
    }, FALLBACK_TIMEOUT_MS);
  }

  private startClaim(extraWaitMs: number): void {
    if (this.destroyed || this.roleValue === "leader" || this.claimTimer) return;
    this.claimTerm = this.termValue + 1;
    this.post({ t: "claim" });
    const wait =
      extraWaitMs + CLAIM_WAIT_MIN_MS + Math.floor(this.random() * CLAIM_WAIT_SPREAD_MS);
    this.claimTimer = setTimeout(() => {
      this.claimTimer = null;
      this.becomeLeader(this.claimTerm);
    }, wait);
  }

  private cancelClaim(): void {
    if (!this.claimTimer) return;
    clearTimeout(this.claimTimer);
    this.claimTimer = null;
  }

  private becomeLeader(term: number): void {
    if (this.destroyed) return;
    this.cancelClaim();
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.termValue = term;
    this.roleValue = "leader";
    this.stopFollowerDuties();
    this.setLeaderId(this.tabId);
    this.post({ t: "lead" });
    if (this.channel) {
      this.heartbeatTimer = setInterval(
        () => this.post({ t: "lead" }),
        this.usingLocks ? LEADER_BEAT_MS : FALLBACK_HEARTBEAT_MS,
      );
    }
    if (this.channel) {
      this.sweepTimer = setInterval(() => this.sweepFollowers(), STATE_SWEEP_MS);
    }
    this.emitRole("leader");
  }

  private stepDown(newLeaderId: string, term: number): void {
    // Papel primeiro (ver `suspend`): a limpeza dos estados das seguidoras
    // não pode ser lida como "ninguém mais vê nada" por uma aba ainda líder.
    this.roleValue = "follower";
    this.termValue = term;
    this.stopLeaderDuties();
    // Com locks, uma líder de termo maior só existe se o lock desta foi
    // roubado: se ainda o segura, solta e volta para a fila.
    if (this.usingLocks && this.releaseLock && this.env.locks) {
      this.releaseLock();
      this.releaseLock = null;
      this.startLocks(this.env.locks);
    }
    this.setLeaderId(newLeaderId);
    this.startFollowerDuties();
    if (!this.usingLocks) this.armTimeout();
    this.emitRole("follower");
    this.scheduleStateSync();
  }

  private emitRole(role: TabRole): void {
    for (const fn of this.roleListeners) {
      try {
        fn(role);
      } catch {
        /* isola */
      }
    }
  }

  private stopLeaderDuties(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.heartbeatTimer = null;
    this.sweepTimer = null;
    if (this.followers.size > 0) {
      this.followers.clear();
      this.emitFollowersChanged();
    }
  }

  private startFollowerDuties(): void {
    if (!this.channel) return;
    if (!this.stateRefreshTimer) {
      this.stateRefreshTimer = setInterval(() => this.postState(), STATE_REFRESH_MS);
    }
    if (!this.leaderWatchTimer && this.env.locks) {
      this.leaderSeenAt = Date.now();
      this.leaderWatchTimer = setInterval(() => this.watchLeader(), LEADER_WATCH_MS);
    }
  }

  private stopFollowerDuties(): void {
    if (this.stateRefreshTimer) clearInterval(this.stateRefreshTimer);
    this.stateRefreshTimer = null;
    if (this.leaderWatchTimer) clearInterval(this.leaderWatchTimer);
    this.leaderWatchTimer = null;
  }

  private setLeaderId(id: string | null): void {
    if (this.leaderIdValue === id) return;
    this.leaderIdValue = id;
    for (const fn of this.leaderListeners) {
      try {
        fn(id);
      } catch {
        /* isola */
      }
    }
  }

  // ── Mensagens ─────────────────────────────────────────────────────

  private handle(raw: unknown): void {
    if (this.destroyed) return;
    const msg = raw as TabEnvelope | null;
    if (!msg || typeof msg !== "object" || msg.v !== 1) return;
    if (msg.from === this.tabId) return;

    switch (msg.t) {
      case "lead":
        this.onLead(msg);
        return;
      case "claim":
        this.onClaim(msg);
        return;
      case "bye":
        this.onBye(msg);
        return;
      case "state":
        if (this.roleValue !== "leader") return;
        this.followers.set(msg.from, { state: msg.state ?? {}, seenAt: Date.now() });
        this.emitFollowersChanged();
        break;
      default:
        // `event`/`status`/`viewers` só valem vindos da líder atual.
        if (msg.term < this.termValue) return;
        if (this.roleValue === "leader") return;
        this.leaderSeenAt = Date.now();
        break;
    }
    for (const fn of this.messageListeners) {
      try {
        fn(msg);
      } catch {
        /* isola */
      }
    }
  }

  private outranks(msg: TabEnvelope, term: number): boolean {
    return msg.term > term || (msg.term === term && msg.from < this.tabId);
  }

  private onLead(msg: TabEnvelope): void {
    if (this.roleValue === "leader") {
      if (this.usingLocks) {
        // Com locks só existe uma líder; um `lead` alheio é uma aba antiga
        // estrangulada que ainda não soube. Reafirma.
        if (msg.term > this.termValue) {
          this.stepDown(msg.from, msg.term);
          return;
        }
        this.post({ t: "lead" });
        return;
      }
      if (this.outranks(msg, this.termValue)) {
        this.stepDown(msg.from, msg.term);
      } else {
        this.post({ t: "lead" });
      }
      return;
    }
    if (msg.term < this.termValue) return;
    this.cancelClaim();
    this.termValue = msg.term;
    this.leaderSeenAt = Date.now();
    const changed = this.leaderIdValue !== msg.from;
    this.setLeaderId(msg.from);
    if (!this.usingLocks) this.armTimeout();
    if (changed) this.scheduleStateSync();
  }

  private onClaim(msg: TabEnvelope): void {
    if (this.roleValue === "leader") {
      if (!this.usingLocks && this.outranks(msg, this.termValue)) {
        this.stepDown(msg.from, msg.term);
        return;
      }
      this.post({ t: "lead" });
      return;
    }
    if (this.usingLocks) return;
    if (this.claimTimer && this.outranks(msg, this.claimTerm)) {
      this.cancelClaim();
      this.armTimeout();
    }
  }

  private onBye(msg: TabEnvelope): void {
    if (this.roleValue === "leader") {
      if (this.followers.delete(msg.from)) this.emitFollowersChanged();
      return;
    }
    if (msg.from !== this.leaderIdValue) return;
    this.setLeaderId(null);
    if (this.usingLocks) return; // o lock passa sozinho
    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.startClaim(0);
  }

  private postState(): void {
    if (this.roleValue !== "follower" || !this.channel) return;
    const state: TabState = {};
    for (const provider of this.stateProviders) {
      try {
        const part = provider();
        if (part.sse) state.sse = { ...(state.sse ?? {}), ...part.sse };
        if (part.presence) state.presence = [...(state.presence ?? []), ...part.presence];
      } catch {
        /* isola */
      }
    }
    this.post({ t: "state", state });
  }

  private sweepFollowers(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, entry] of this.followers) {
      if (now - entry.seenAt > STATE_TTL_MS) {
        this.followers.delete(id);
        changed = true;
      }
    }
    if (changed) this.emitFollowersChanged();
  }

  private emitFollowersChanged(): void {
    for (const fn of this.followerListeners) {
      try {
        fn();
      } catch {
        /* isola */
      }
    }
  }
}

/** Ambiente real: `BroadcastChannel` + `navigator.locks` do browser. */
export function browserTabEnv(): TabEnv {
  const hasChannel = typeof BroadcastChannel === "function";
  const locks =
    typeof navigator !== "undefined" && "locks" in navigator && navigator.locks
      ? (navigator.locks as unknown as TabLocksLike)
      : null;
  return {
    // O DOM tipa `onmessage` com `MessageEvent`; aqui só lemos `data`.
    createChannel: (name) =>
      hasChannel ? (new BroadcastChannel(name) as unknown as TabChannelLike) : null,
    locks,
    isVisible: () =>
      typeof document === "undefined" || document.visibilityState === "visible",
    lifecycle: ({ hide, show }) => {
      if (typeof window === "undefined") return () => {};
      const onShow = (ev: PageTransitionEvent) => {
        if (ev.persisted) show();
      };
      window.addEventListener("pagehide", hide);
      window.addEventListener("pageshow", onShow);
      return () => {
        window.removeEventListener("pagehide", hide);
        window.removeEventListener("pageshow", onShow);
      };
    },
  };
}

const coordinators = new Map<string, TabCoordinator>();

/** Coordenador singleton por nome (um lock/canal por navegador). */
export function tabCoordinatorFor(name = "crm", env?: TabEnv): TabCoordinator {
  let c = coordinators.get(name);
  if (!c) {
    c = new TabCoordinator(name, env ?? browserTabEnv());
    coordinators.set(name, c);
  }
  return c;
}
