"use client";

import { isSingleLeaderEnabled } from "./sse-single-leader";
import {
  tabCoordinatorFor,
  type TabCoordinator,
  type TabEnvelope,
} from "./tab-coordinator";

/**
 * Presença "quem está vendo" entre abas (MA-2). Cada aba registra as
 * entidades que tem abertas (`registerEntityView`); só a aba LÍDER
 * (`tab-coordinator.ts`) manda o heartbeat ao backend, agregando as
 * entidades de todas as abas — o mesmo deal aberto em três abas vira UM
 * POST a cada 25s, e não três. As seguidoras informam à líder o que
 * estão vendo pelo `state` do coordenador e recebem a lista de viewers
 * de volta (`viewers`), além do SSE `entity_viewers` que já chega a
 * todas pela conexão única.
 *
 * - Heartbeat a cada `ENTITY_VIEWERS_HEARTBEAT_MS` (25s); o TTL do
 *   backend é 90s (`src/lib/entity-presence.ts`), folga para a troca de
 *   líder (< 2s) e para a líder em segundo plano.
 * - Aba oculta: depois de 30s escondida a aba deixa de reportar as suas
 *   entidades (a líder manda `leave`); ao voltar, reporta de novo (join
 *   imediato). Alt-tab rápido não mexe na pilha de avatares dos outros.
 * - Aba fechada: seguidora → `bye` → a líder manda `leave` do que mais
 *   ninguém vê. Líder → `onSuspend` manda `leave` do que só ela via, e a
 *   próxima líder renova o resto na hora.
 */

export const ENTITY_VIEWERS_HEARTBEAT_MS = 25_000;
export const PRESENCE_HIDDEN_GRACE_MS = 30_000;

export type EntityViewer = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

type ViewersListener = (viewers: EntityViewer[]) => void;

export interface PresenceEnv {
  tabs: TabCoordinator | null;
  /** POST join/renova; devolve a lista atual (ou `null` em erro). */
  heartbeat: (entityType: string, entityId: string) => Promise<EntityViewer[] | null>;
  /** Saída explícita (beacon). */
  leave: (entityType: string, entityId: string) => void;
  isHidden: () => boolean;
  onVisibilityChange: (fn: () => void) => () => void;
}

export function presenceKey(entityType: string, entityId: string): string {
  return `${entityType}|${entityId}`;
}

export function parsePresenceKey(key: string): { entityType: string; entityId: string } {
  const i = key.indexOf("|");
  return { entityType: key.slice(0, i), entityId: key.slice(i + 1) };
}

export class PresenceSync {
  private readonly local = new Map<string, Set<ViewersListener>>();
  /** Líder: entidades em heartbeat (locais + seguidoras). */
  private readonly active = new Set<string>();
  /** Líder: última visão do que as seguidoras reportam. */
  private followerKeys = new Set<string>();
  private beatTimer: ReturnType<typeof setInterval> | null = null;
  private hiddenTimer: ReturnType<typeof setTimeout> | null = null;
  private hiddenExpired = false;
  private readonly offs: Array<() => void> = [];

  constructor(private readonly env: PresenceEnv) {
    const tabs = env.tabs;
    if (tabs) {
      this.offs.push(
        tabs.registerStateProvider(() => ({ presence: this.reportedKeys() })),
        tabs.onRoleChange(() => this.sync()),
        tabs.onFollowerStatesChange(() => this.sync()),
        tabs.onSuspend((wasLeader) => this.onSuspend(wasLeader)),
        tabs.onMessage((msg: TabEnvelope) => {
          if (msg.t === "viewers" && Array.isArray(msg.viewers)) {
            this.deliver(msg.key, msg.viewers as EntityViewer[]);
          }
        }),
      );
    }
    this.offs.push(env.onVisibilityChange(() => this.onVisibility()));
    if (env.isHidden()) this.armHiddenGrace();
  }

  private isLeader(): boolean {
    return !this.env.tabs || this.env.tabs.role === "leader";
  }

  register(entityType: string, entityId: string, listener: ViewersListener): () => void {
    const key = presenceKey(entityType, entityId);
    let set = this.local.get(key);
    if (!set) {
      set = new Set();
      this.local.set(key, set);
    }
    set.add(listener);
    this.env.tabs?.scheduleStateSync();
    this.sync();
    return () => {
      const current = this.local.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.local.delete(key);
      this.env.tabs?.scheduleStateSync();
      this.sync();
    };
  }

  /** O que esta aba reporta (vazio depois de 30s oculta). */
  reportedKeys(): string[] {
    return this.hiddenExpired ? [] : [...this.local.keys()];
  }

  /** Líder: união do que esta aba e as seguidoras veem. */
  desiredKeys(): Set<string> {
    const keys = new Set(this.reportedKeys());
    const tabs = this.env.tabs;
    if (tabs && tabs.role === "leader") {
      this.followerKeys = new Set<string>();
      for (const entry of tabs.followerStates().values()) {
        for (const key of entry.state.presence ?? []) {
          keys.add(key);
          this.followerKeys.add(key);
        }
      }
    }
    return keys;
  }

  /** Reconcilia os heartbeats com o papel da aba e o que todos veem. */
  sync(): void {
    if (!this.isLeader()) {
      // Seguidora (ou líder que acabou de ceder): a nova líder renova o
      // que todos reportam — sair aqui faria a pilha piscar.
      this.active.clear();
      this.stopBeat();
      return;
    }
    const want = this.desiredKeys();
    for (const key of this.active) {
      if (want.has(key)) continue;
      this.active.delete(key);
      const { entityType, entityId } = parsePresenceKey(key);
      this.env.leave(entityType, entityId);
    }
    for (const key of want) {
      if (this.active.has(key)) continue;
      this.active.add(key);
      void this.beat(key); // join imediato
    }
    if (this.active.size > 0) this.startBeat();
    else this.stopBeat();
  }

  private async beat(key: string): Promise<void> {
    const { entityType, entityId } = parsePresenceKey(key);
    let viewers: EntityViewer[] | null = null;
    try {
      viewers = await this.env.heartbeat(entityType, entityId);
    } catch {
      viewers = null;
    }
    if (!viewers || !this.active.has(key)) return;
    this.deliver(key, viewers);
    this.env.tabs?.post({ t: "viewers", key, viewers });
  }

  private deliver(key: string, viewers: EntityViewer[]): void {
    for (const fn of this.local.get(key) ?? []) {
      try {
        fn(viewers);
      } catch {
        /* isola */
      }
    }
  }

  private startBeat(): void {
    if (this.beatTimer) return;
    this.beatTimer = setInterval(() => {
      for (const key of this.active) void this.beat(key);
    }, ENTITY_VIEWERS_HEARTBEAT_MS);
  }

  private stopBeat(): void {
    if (!this.beatTimer) return;
    clearInterval(this.beatTimer);
    this.beatTimer = null;
  }

  private onVisibility(): void {
    if (this.env.isHidden()) {
      this.armHiddenGrace();
      return;
    }
    if (this.hiddenTimer) {
      clearTimeout(this.hiddenTimer);
      this.hiddenTimer = null;
    }
    if (!this.hiddenExpired) return;
    this.hiddenExpired = false;
    this.env.tabs?.scheduleStateSync();
    this.sync();
  }

  private armHiddenGrace(): void {
    if (this.hiddenTimer || this.hiddenExpired) return;
    this.hiddenTimer = setTimeout(() => {
      this.hiddenTimer = null;
      if (!this.env.isHidden()) return;
      this.hiddenExpired = true;
      this.env.tabs?.scheduleStateSync();
      this.sync();
    }, PRESENCE_HIDDEN_GRACE_MS);
  }

  /** Líder fechando: despede-se só do que nenhuma seguidora vê. */
  private onSuspend(wasLeader: boolean): void {
    if (!wasLeader) return;
    for (const key of this.active) {
      if (this.followerKeys.has(key)) continue;
      const { entityType, entityId } = parsePresenceKey(key);
      this.env.leave(entityType, entityId);
    }
    this.active.clear();
    this.stopBeat();
  }

  destroy(): void {
    while (this.offs.length) this.offs.pop()?.();
    this.stopBeat();
    if (this.hiddenTimer) clearTimeout(this.hiddenTimer);
    this.hiddenTimer = null;
  }
}

async function postHeartbeat(
  entityType: string,
  entityId: string,
): Promise<EntityViewer[] | null> {
  const res = await fetch("/api/presence/heartbeat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType, entityId }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { viewers?: EntityViewer[] };
  return Array.isArray(json.viewers) ? json.viewers : null;
}

function leaveBeacon(entityType: string, entityId: string): void {
  try {
    const blob = new Blob(
      [JSON.stringify({ entityType, entityId, action: "leave" })],
      { type: "application/json" },
    );
    navigator.sendBeacon("/api/presence/heartbeat", blob);
  } catch {
    /* ignore */
  }
}

export function browserPresenceEnv(): PresenceEnv {
  return {
    // Chave desligada: aba isolada (bate sozinha). O `useEntityViewers`
    // nem chega aqui nesse modo — usa o caminho legado.
    tabs: isSingleLeaderEnabled() ? tabCoordinatorFor("crm") : null,
    heartbeat: postHeartbeat,
    leave: leaveBeacon,
    isHidden: () => typeof document !== "undefined" && document.hidden,
    onVisibilityChange: (fn) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", fn);
      return () => document.removeEventListener("visibilitychange", fn);
    },
  };
}

let defaultSync: PresenceSync | null = null;

function presence(): PresenceSync {
  if (!defaultSync) defaultSync = new PresenceSync(browserPresenceEnv());
  return defaultSync;
}

/** Só para testes: troca o ambiente padrão (ou volta ao real com `null`). */
export function __setDefaultPresenceEnvForTests(env: PresenceEnv | null): void {
  defaultSync?.destroy();
  defaultSync = env ? new PresenceSync(env) : null;
}

/**
 * Registra "esta aba está vendo `entityType/entityId`" e recebe a lista
 * de viewers a cada heartbeat (da líder, ou retransmitida por ela).
 * Devolve o unregister (unmount / troca de entidade).
 */
export function registerEntityView(
  entityType: string,
  entityId: string,
  listener: ViewersListener,
): () => void {
  return presence().register(entityType, entityId, listener);
}
