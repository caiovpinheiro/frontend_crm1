"use client";

import { apiUrl } from "@/lib/api";
import { PRESENCE_PING_MIN_GAP_MS } from "@/lib/presence-ping-gate";

import { isSingleLeaderEnabled } from "./sse-single-leader";
import {
  tabCoordinatorFor,
  type TabCoordinator,
  type TabEnvelope,
} from "./tab-coordinator";

/**
 * Presença de uso ("CRM aberto") e uso real num tique só, por navegador
 * (F2, 05/10).
 *
 * Antes: cada aba mandava `POST /api/agents/me/ping` (1 ao abrir + a cada
 * 90 s + em foco/visibilidade) e, com a aba visível, `POST
 * /api/agents/me/activity` com 2 pulsos por janela de 90 s mais 1 por troca
 * de rota (R3-FE-8). Três abas = três pings por janela.
 *
 * Agora:
 *  - só a aba LÍDER (`tab-coordinator.ts`, a mesma da SSE) chama a API;
 *  - um tique a cada `PRESENCE_TICK_MS` manda o ping e, se houve uso, o
 *    activity com a contagem agregada de TODAS as abas (as seguidoras
 *    repassam à líder pelo canal, no máximo a cada `ACTIVITY_FORWARD_MS`);
 *  - dois tiques nunca saem a menos de `PRESENCE_MIN_GAP_MS` (45 s) — nem
 *    na troca de líder ou F5: o instante do último tique é do navegador
 *    (`localStorage`), não da aba;
 *  - a 1ª interação depois de 5 min sem activity antecipa o tique (abre a
 *    sessão de uso no backend sem esperar a janela), respeitando os 45 s;
 *    a cadência recomeça desse tique;
 *  - foco/visibilidade só antecipam o tique se ele estiver atrasado (aba
 *    estrangulada pelo navegador em segundo plano).
 *
 * O backend não tem rota única ping+activity: são duas chamadas no mesmo
 * tique. Com a rota combinada, troca-se só `ping`/`activity` no env.
 * Falhas são silenciadas — presença é best-effort.
 */

/** Cadência do tique (sweeper do backend: offline após 300 s sem ping). */
export const PRESENCE_TICK_MS = 90_000;
/** Intervalo mínimo entre dois tiques do navegador. */
export const PRESENCE_MIN_GAP_MS = PRESENCE_PING_MIN_GAP_MS;
/** Seguidora junta as interações e repassa à líder no máximo a cada 5 s. */
export const ACTIVITY_FORWARD_MS = 5_000;
/** Sessão de uso do backend fecha 5 min após o último pulso (`SYSTEM_ACTIVITY_IDLE_MS`). */
export const ACTIVITY_SESSION_IDLE_MS = 5 * 60_000;
/** Instante (ms) do último tique deste navegador. */
export const PRESENCE_LAST_TICK_STORAGE_KEY = "bwipo:presence:last-tick";

export interface PresenceTickerEnv {
  /** `null` = aba isolada (sem coordenação): é a líder de si mesma. */
  tabs: TabCoordinator | null;
  ping: () => Promise<unknown>;
  activity: (interactionCount: number) => Promise<unknown>;
  /** Último tique do navegador (qualquer aba). */
  readLastTick?: () => number | null;
  writeLastTick?: (at: number) => void;
  isVisible: () => boolean;
  onVisibilityChange: (fn: () => void) => () => void;
}

type TickReason = "lead" | "timer" | "activity" | "visible";

export class PresenceTicker {
  /** Líder: interações a enviar. Seguidora: interações a repassar. */
  private pending = 0;
  private lastTickAt = Number.NEGATIVE_INFINITY;
  private lastActivitySentAt = Number.NEGATIVE_INFINITY;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;
  private nextAt = Number.POSITIVE_INFINITY;
  private forwardTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private destroyed = false;
  private wasLeader = false;
  private readonly offs: Array<() => void> = [];

  constructor(private readonly env: PresenceTickerEnv) {
    const tabs = env.tabs;
    if (tabs) {
      this.offs.push(
        tabs.onRoleChange(() => this.sync()),
        tabs.onMessage((msg: TabEnvelope) => {
          if (msg.t === "activity") this.receive(msg.count);
        }),
        tabs.onSuspend((wasLeader) => this.onSuspend(wasLeader)),
      );
    }
    this.offs.push(env.onVisibilityChange(() => this.onVisibility()));
    this.sync();
  }

  private isLeader(): boolean {
    return !this.env.tabs || this.env.tabs.role === "leader";
  }

  /** Último tique conhecido: desta aba ou de outra (troca de líder, F5). */
  private lastTick(): number {
    const shared = this.env.readLastTick?.() ?? null;
    return shared != null && shared > this.lastTickAt ? shared : this.lastTickAt;
  }

  /** Reconcilia com o papel da aba. */
  sync(): void {
    if (this.destroyed) return;
    if (this.isLeader()) {
      if (this.wasLeader) return;
      this.wasLeader = true;
      this.requestTick("lead");
      return;
    }
    this.wasLeader = false;
    this.clearNext();
    if (this.pending > 0) this.forward();
  }

  /** Uma interação real nesta aba (clique, digitação, troca de rota…). */
  record(count = 1): void {
    if (this.destroyed || count <= 0) return;
    if (!this.env.isVisible()) return;
    this.pending += count;
    if (this.isLeader()) {
      this.maybeOpenSession();
    } else {
      this.scheduleForward();
    }
  }

  private receive(count: unknown): void {
    if (this.destroyed || !this.isLeader()) return;
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) return;
    this.pending += Math.floor(n);
    this.maybeOpenSession();
  }

  private maybeOpenSession(): void {
    if (Date.now() - this.lastActivitySentAt >= ACTIVITY_SESSION_IDLE_MS) {
      this.requestTick("activity");
    }
  }

  private requestTick(reason: TickReason): void {
    if (this.destroyed || !this.isLeader()) return;
    const since = Date.now() - this.lastTick();
    if (reason === "visible") {
      // Só recupera tique atrasado (timer estrangulado em segundo plano).
      if (since >= PRESENCE_TICK_MS) void this.tick();
      return;
    }
    if (since >= PRESENCE_MIN_GAP_MS) {
      void this.tick();
      return;
    }
    // Bloqueado pelo intervalo mínimo: a abertura de sessão sai assim que
    // os 45 s passarem; o resto segue a cadência a partir do último tique.
    const wait = (reason === "activity" ? PRESENCE_MIN_GAP_MS : PRESENCE_TICK_MS) - since;
    this.scheduleNext(Date.now() + Math.max(0, wait));
  }

  private scheduleNext(at: number, replace = false): void {
    if (this.destroyed) return;
    if (!replace && this.nextTimer && this.nextAt <= at) return;
    this.clearNext();
    this.nextAt = at;
    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      this.nextAt = Number.POSITIVE_INFINITY;
      this.requestTick("timer");
    }, Math.max(0, at - Date.now()));
  }

  private clearNext(): void {
    if (this.nextTimer) clearTimeout(this.nextTimer);
    this.nextTimer = null;
    this.nextAt = Number.POSITIVE_INFINITY;
  }

  private async tick(): Promise<void> {
    if (this.inFlight || this.destroyed) return;
    this.inFlight = true;
    const at = Date.now();
    this.lastTickAt = at;
    this.env.writeLastTick?.(at);
    const count = this.pending;
    this.pending = 0;
    if (count > 0) this.lastActivitySentAt = at;
    // A cadência recomeça deste tique.
    this.scheduleNext(at + PRESENCE_TICK_MS, true);
    try {
      await Promise.allSettled([
        this.env.ping(),
        count > 0 ? this.env.activity(count) : Promise.resolve(),
      ]);
    } finally {
      this.inFlight = false;
    }
  }

  private scheduleForward(): void {
    if (this.forwardTimer) return;
    this.forwardTimer = setTimeout(() => {
      this.forwardTimer = null;
      this.forward();
    }, ACTIVITY_FORWARD_MS);
  }

  private forward(): void {
    if (this.forwardTimer) clearTimeout(this.forwardTimer);
    this.forwardTimer = null;
    const count = this.pending;
    if (count <= 0) return;
    if (this.isLeader()) {
      this.maybeOpenSession();
      return;
    }
    this.pending = 0;
    this.env.tabs?.post({ t: "activity", count });
  }

  private onVisibility(): void {
    if (this.env.isVisible()) this.requestTick("visible");
  }

  /** `pagehide`: o que ainda não saiu não se perde. */
  private onSuspend(wasLeader: boolean): void {
    this.flushPending(wasLeader);
  }

  private flushPending(asLeader: boolean): void {
    const count = this.pending;
    if (count <= 0) return;
    this.pending = 0;
    if (asLeader) {
      void this.env.activity(count).catch(() => undefined);
    } else {
      this.env.tabs?.post({ t: "activity", count });
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.flushPending(this.isLeader());
    this.destroyed = true;
    while (this.offs.length) this.offs.pop()?.();
    this.clearNext();
    if (this.forwardTimer) clearTimeout(this.forwardTimer);
    this.forwardTimer = null;
  }
}

// ── Ambiente do navegador ────────────────────────────────────────────

async function postPing(): Promise<void> {
  await fetch(apiUrl("/api/agents/me/ping"), {
    method: "POST",
    credentials: "include",
    keepalive: true,
  });
}

async function postActivity(interactionCount: number): Promise<void> {
  await fetch(apiUrl("/api/agents/me/activity"), {
    method: "POST",
    keepalive: true,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interactionCount }),
  });
}

export function browserPresenceTickerEnv(): PresenceTickerEnv {
  const tabs = isSingleLeaderEnabled() ? tabCoordinatorFor("crm") : null;
  return {
    tabs,
    ping: postPing,
    activity: postActivity,
    // Sem coordenação cada aba é líder de si mesma: o instante compartilhado
    // faria uma aba calar a outra (e a contagem dela não sairia).
    readLastTick: tabs
      ? () => {
          try {
            const raw = window.localStorage.getItem(PRESENCE_LAST_TICK_STORAGE_KEY);
            const at = raw ? Number(raw) : NaN;
            return Number.isFinite(at) ? at : null;
          } catch {
            return null;
          }
        }
      : undefined,
    writeLastTick: tabs
      ? (at) => {
          try {
            window.localStorage.setItem(PRESENCE_LAST_TICK_STORAGE_KEY, String(at));
          } catch {
            /* storage bloqueado: só o gap desta aba */
          }
        }
      : undefined,
    isVisible: () =>
      typeof document === "undefined" || document.visibilityState === "visible",
    onVisibilityChange: (fn) => {
      if (typeof document === "undefined") return () => {};
      const onFocus = () => fn();
      document.addEventListener("visibilitychange", fn);
      window.addEventListener("focus", onFocus);
      return () => {
        document.removeEventListener("visibilitychange", fn);
        window.removeEventListener("focus", onFocus);
      };
    },
  };
}

let ticker: PresenceTicker | null = null;
let holders = 0;

/**
 * Liga o tique desta página enquanto houver quem o segure (heartbeat e
 * rastreador de uso montados no shell). Devolve o `release`.
 */
export function acquirePresenceTicker(): () => void {
  if (typeof window === "undefined") return () => {};
  holders += 1;
  ticker ??= new PresenceTicker(browserPresenceTickerEnv());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders <= 0) {
      holders = 0;
      ticker?.destroy();
      ticker = null;
    }
  };
}

/** Interação real desta aba — no-op sem tique ligado. */
export function recordPresenceActivity(count = 1): void {
  ticker?.record(count);
}
