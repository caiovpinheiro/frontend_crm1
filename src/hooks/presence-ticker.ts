"use client";

import { apiUrl } from "@/lib/api";
import { PRESENCE_PING_MIN_GAP_MS } from "@/lib/presence-ping-gate";
import {
  endIdleSession,
  notePageOpen,
  sessionIdleClock,
  watchOnlineAutoReload,
} from "@/lib/session-idle";
import {
  handleUnauthorized,
  isSessionEnded,
  watchSessionEndInOtherTabs,
} from "@/lib/session-revoked";

import {
  presenceBeatHub,
  type PresenceBeatHub,
  type PresenceEntity,
} from "./presence-beat-hub";
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
 *  - dois tiques nunca saem a menos de `PRESENCE_MIN_GAP_MS` (45 s); na
 *    troca de líder ou F5 a nova líder segue a cadência — próximo tique
 *    90 s depois do último do navegador: o instante do último tique é do
 *    navegador (`localStorage`), não da aba;
 *  - a 1ª interação depois de 5 min sem activity antecipa o tique (abre a
 *    sessão de uso no backend sem esperar a janela), respeitando os 45 s;
 *    a cadência recomeça desse tique;
 *  - foco/visibilidade só antecipam o tique se ele estiver atrasado (aba
 *    estrangulada pelo navegador em segundo plano).
 *
 * O backend não tem rota única ping+activity: são duas chamadas no mesmo
 * tique. Com a rota combinada, troca-se só `ping`/`activity` no env.
 * Falhas são silenciadas — presença é best-effort —, com duas exceções:
 *  - 401 (com ou sem `code`): a sessão acabou. O tique PARA de vez — sem
 *    retry nem backoff — e o logout sai pelo caminho único de
 *    `lib/session-revoked.ts` (uma vez por navegador). Antes o 401 era
 *    ignorado e cada navegador seguia pingando a cada 90 s para sempre.
 *    Só não para durante a renovação da própria sessão (troca de senha).
 *  - 429 (`{ retryAfterMs }` / `Retry-After`): o próximo tique não sai
 *    antes do prazo pedido; as interações não enviadas voltam à fila.
 *
 * O ping leva `x-tab-id` (id da aba no `tab-coordinator`): o backend
 * limita o ping por usuário e aba.
 *
 * Ociosidade (`lib/session-idle.ts`): o ping leva no corpo
 * `lastInteractionAt` — a última interação humana do NAVEGADOR (todas as
 * abas) — e o 200 devolve `sessionIdleMs`. A cada tique, ANTES do ping, a
 * líder confere localmente: parado além do limite → logout pelo caminho
 * único (sem ping). O 401 `reason: "idle"` do backend cai no 401 comum.
 *
 * Um ping por navegador: só a líder tica, e o instante do último tique e o
 * prazo de um 429 (`retryAfterMs`, teto por usuário) ficam no
 * `localStorage` — a líder que assume (a anterior fechou ou travou) segue
 * a cadência do navegador e respeita o 429 que a outra recebeu.
 *
 * Batida única (`POST /api/presence/beat`, `presence-beat-hub.ts`): com o
 * backend novo o tique manda o beat NO LUGAR do ping — `tabId`,
 * `lastInteractionAt` e a união das entidades abertas em todas as abas —
 * a cada `nextBeatMs` da resposta (padrão `PRESENCE_BEAT_DEFAULT_MS`,
 * 60 s); os `viewers` da resposta vão ao `presence-sync`, que deixa de
 * mandar o heartbeat por entidade e o `leave`. Cadência ESTRITA: abrir ou
 * fechar entidade, resposta deduplicada ou o activity nunca antecipam a
 * batida — a próxima já leva a lista nova (TTL dos viewers no servidor:
 * 150 s). No `pagehide` da ÚLTIMA aba do navegador sai um `sendBeacon`
 * do beat com `entities: []` (a saída de tudo, 1 chamada). Ociosidade,
 * 401, 429/503 com prazo e `x-tab-id` como no ping. 404 → volta ao ping
 * (no mesmo tique) e ao heartbeat por entidade.
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
/** 429 do ping/activity: nenhum tique do navegador antes deste instante (ms). */
export const PRESENCE_HOLD_UNTIL_STORAGE_KEY = "bwipo:presence:hold-until";

/** Cadência padrão da batida única (sem `nextBeatMs` na resposta). */
export const PRESENCE_BEAT_DEFAULT_MS = 60_000;
/** Entidades mudaram: antecipa a batida só se a última foi há isto ou mais. */
export const PRESENCE_BEAT_MIN_GAP_MS = 30_000;
/** Teto aceito para o `nextBeatMs` do backend. */
export const PRESENCE_BEAT_MAX_MS = 5 * 60_000;

/** Resposta de ping/activity/beat que importa ao tique (sem valor = sucesso). */
export type PresenceCallResult = {
  status: number;
  /** 429: espera pedida pelo backend (`retryAfterMs` ou `Retry-After`). */
  retryAfterMs?: number;
  /** 200 do ping/beat: limite de ociosidade da sessão (ms). Ausente = backend antigo. */
  sessionIdleMs?: number;
  /** 200 do beat: quando mandar a próxima (ms). */
  nextBeatMs?: number;
  /** 200 do beat: `{ "<type>:<id>": viewers[] }`. */
  viewers?: unknown;
  /**
   * 200 do beat deduplicado (outra batida do usuário há pouco): não é 429.
   * `retryAfterMs` só antecipa a próxima se a lista de entidades mudou.
   */
  deduped?: boolean;
};

export type PresenceBeatBody = {
  lastInteractionAt: number | null;
  entities: PresenceEntity[];
};

/** Batida final (`sendBeacon`) da última aba que fecha: `entities: []`. */
export type PresenceFinalBeacon = (body: PresenceBeatBody) => void;

/** Ociosidade da sessão (`lib/session-idle.ts`), vista pelo tique. */
export interface PresenceIdleEnv {
  /** Última interação humana do navegador (vai no corpo do ping). */
  lastInteractionAt: () => number | null;
  /** Parado além do limite? Conferido antes de cada ping. */
  isExpired: () => boolean;
  /** Limite do último 200 do ping (`undefined` = padrão de 12 h). */
  setLimitMs: (ms: number | undefined) => void;
  /** Logout por ociosidade. `true` = sessão encerrada (o tique para). */
  onExpired: () => boolean;
}

export interface PresenceTickerEnv {
  /** `null` = aba isolada (sem coordenação): é a líder de si mesma. */
  tabs: TabCoordinator | null;
  /** `lastInteractionAt`: última interação humana do navegador (`null` = sem registro). */
  ping: (lastInteractionAt: number | null) => Promise<PresenceCallResult | void>;
  activity: (interactionCount: number) => Promise<PresenceCallResult | void>;
  /** `POST /api/presence/beat` (substitui o ping quando o backend tem). */
  beat?: (body: PresenceBeatBody) => Promise<PresenceCallResult>;
  /** Elo com o `presence-sync` (entidades, viewers, 404). Sem ele não há beat. */
  hub?: PresenceBeatHub | null;
  /** `pagehide` da última aba (líder sem seguidoras) com o beat em uso. */
  finalBeacon?: PresenceFinalBeacon;
  /**
   * 401 em ping/activity. Devolve `true` quando a sessão acabou (o tique
   * para de vez); `false` = 401 esperado (renovação da sessão em
   * andamento), segue a cadência. Sem o callback, qualquer 401 para.
   */
  onUnauthorized?: () => boolean;
  /** A sessão já acabou (logout nesta ou em outra aba): não chama a API. */
  isSessionEnded?: () => boolean;
  /** Último tique do navegador (qualquer aba). */
  readLastTick?: () => number | null;
  writeLastTick?: (at: number) => void;
  /** Prazo de um 429 recebido por qualquer aba do navegador. */
  readHoldUntil?: () => number | null;
  writeHoldUntil?: (at: number) => void;
  /** Sem `idle`: não há checagem de ociosidade nem `lastInteractionAt`. */
  idle?: PresenceIdleEnv;
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
  /** 401: o tique parou de vez (sessão encerrada). */
  private halted = false;
  /** 429: nenhum tique antes deste instante. */
  private holdUntil = Number.NEGATIVE_INFINITY;
  private wasLeader = false;
  /** Cadência da batida única (do `nextBeatMs` da última resposta). */
  private beatIntervalMs = PRESENCE_BEAT_DEFAULT_MS;
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

  /** Batida única em uso (backend com `/api/presence/beat`, ou ainda sem 404)? */
  private usingBeat(): boolean {
    return !!this.env.beat && !!this.env.hub?.active;
  }

  /** Intervalo entre tiques: o do beat ou o do ping. */
  private interval(): number {
    return this.usingBeat() ? this.beatIntervalMs : PRESENCE_TICK_MS;
  }

  private isLeader(): boolean {
    return !this.env.tabs || this.env.tabs.role === "leader";
  }

  /** Último tique conhecido: desta aba ou de outra (troca de líder, F5). */
  private lastTick(): number {
    const shared = this.env.readLastTick?.() ?? null;
    return shared != null && shared > this.lastTickAt ? shared : this.lastTickAt;
  }

  /** Prazo de 429 conhecido: desta aba ou de outra (troca de líder). */
  private holdUntilAt(): number {
    const shared = this.env.readHoldUntil?.() ?? null;
    return shared != null && shared > this.holdUntil ? shared : this.holdUntil;
  }

  /** O tique parou por 401 (sessão encerrada)? */
  get stopped(): boolean {
    return this.halted;
  }

  private get dead(): boolean {
    return this.destroyed || this.halted;
  }

  /** Reconcilia com o papel da aba. */
  sync(): void {
    if (this.dead) return;
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
    if (this.dead || count <= 0) return;
    if (!this.env.isVisible()) return;
    this.pending += count;
    if (this.isLeader()) {
      this.maybeOpenSession();
    } else {
      this.scheduleForward();
    }
  }

  private receive(count: unknown): void {
    if (this.dead || !this.isLeader()) return;
    const n = Number(count);
    if (!Number.isFinite(n) || n <= 0) return;
    this.pending += Math.floor(n);
    this.maybeOpenSession();
  }

  private maybeOpenSession(): void {
    if (Date.now() - this.lastActivitySentAt < ACTIVITY_SESSION_IDLE_MS) return;
    // Com o beat, abrir a sessão de uso manda SÓ o activity: a batida
    // segue a cadência estrita.
    if (this.usingBeat()) void this.sendActivityNow();
    else this.requestTick("activity");
  }

  /** Beat em uso: o activity que abre a sessão de uso sai sozinho, já. */
  private async sendActivityNow(): Promise<void> {
    if (this.dead || !this.isLeader() || this.pending <= 0) return;
    if (Date.now() < this.holdUntilAt()) return; // 429: espera o prazo (vai no tique)
    const count = this.pending;
    this.pending = 0;
    this.lastActivitySentAt = Date.now();
    let result: PresenceCallResult | void;
    try {
      result = await this.env.activity(count);
    } catch {
      result = undefined;
    }
    if (this.dead) return;
    if (result?.status === 401) {
      this.onUnauthorizedResponse();
      return;
    }
    if (result?.status === 429) {
      this.pending += count; // não se perde: vai no próximo tique
      const waitMs = retryAfterOf(result);
      this.holdUntil = Date.now() + waitMs;
      this.env.writeHoldUntil?.(this.holdUntil);
      if (this.holdUntil > this.nextAt) this.scheduleNext(this.holdUntil, true);
    }
  }

  private requestTick(reason: TickReason): void {
    if (this.dead || !this.isLeader()) return;
    const holdUntil = this.holdUntilAt();
    if (Date.now() < holdUntil) {
      // 429: nada sai antes do prazo do backend.
      this.scheduleNext(holdUntil);
      return;
    }
    const since = Date.now() - this.lastTick();
    const interval = this.interval();
    if (reason === "visible") {
      // Só recupera tique atrasado (timer estrangulado em segundo plano).
      if (since >= interval) void this.tick();
      return;
    }
    // Troca de líder / F5: segue a cadência do navegador (1 ping por
    // ciclo), em vez de pingar já com o último tique a 45–90 s.
    const minGap = reason === "lead" ? interval : PRESENCE_MIN_GAP_MS;
    if (since >= minGap) {
      void this.tick();
      return;
    }
    // Bloqueado pelo intervalo mínimo: a abertura de sessão sai assim que
    // os 45 s passarem; o resto segue a cadência a partir do último tique.
    const wait = (reason === "activity" ? PRESENCE_MIN_GAP_MS : interval) - since;
    this.scheduleNext(Date.now() + Math.max(0, wait));
  }

  private scheduleNext(at: number, replace = false): void {
    if (this.dead) return;
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
    if (this.inFlight || this.dead) return;
    if (this.env.isSessionEnded?.()) {
      this.halt();
      return;
    }
    // Parado além do limite: logout sem ping (o backend recusaria).
    if (this.env.idle?.isExpired() && this.env.idle.onExpired()) {
      this.halt();
      return;
    }
    this.inFlight = true;
    const at = Date.now();
    this.lastTickAt = at;
    this.env.writeLastTick?.(at);
    const count = this.pending;
    this.pending = 0;
    if (count > 0) this.lastActivitySentAt = at;
    // A cadência recomeça deste tique.
    this.scheduleNext(at + this.interval(), true);
    let results: Array<PresenceCallResult | void> = [];
    try {
      const settled = await Promise.allSettled([
        this.presenceCall(this.env.idle?.lastInteractionAt() ?? null, at),
        count > 0 ? this.env.activity(count) : Promise.resolve(),
      ]);
      results = settled.map((r) => (r.status === "fulfilled" ? r.value : undefined));
    } finally {
      this.inFlight = false;
    }
    if (this.dead) return;
    const [pingResult, activityResult] = results;
    if (pingResult?.status === 401 || activityResult?.status === 401) {
      this.onUnauthorizedResponse();
      return;
    }
    if (pingResult && pingResult.status >= 200 && pingResult.status < 300) {
      this.env.idle?.setLimitMs(pingResult.sessionIdleMs);
    }
    if (activityResult?.status === 429) this.pending += count; // não se perde
    const waitMs = Math.max(retryAfterOf(pingResult), retryAfterOf(activityResult));
    if (waitMs > 0) {
      this.holdUntil = Date.now() + waitMs;
      this.env.writeHoldUntil?.(this.holdUntil);
      // A cadência normal segue valendo quando é mais longa que o prazo.
      if (this.holdUntil > this.nextAt) this.scheduleNext(this.holdUntil, true);
    }
  }

  /** Beat (backend novo) ou ping; 404 no beat → ping no mesmo tique. */
  private async presenceCall(
    lastInteractionAt: number | null,
    at: number,
  ): Promise<PresenceCallResult | void> {
    const hub = this.env.hub;
    if (!this.env.beat || !hub?.active) return this.env.ping(lastInteractionAt);
    const entities = hub.entities();
    const result = await this.env.beat({ lastInteractionAt, entities });
    if (result.status === 404 || result.status === 405 || result.status === 501) {
      hub.markUnsupported();
      return this.env.ping(lastInteractionAt);
    }
    if (result.status >= 200 && result.status < 300) {
      const next = result.nextBeatMs;
      const interval =
        typeof next === "number" && Number.isFinite(next) && next > 0
          ? Math.min(PRESENCE_BEAT_MAX_MS, Math.max(PRESENCE_BEAT_MIN_GAP_MS, next))
          : PRESENCE_BEAT_DEFAULT_MS;
      if (interval !== this.beatIntervalMs) {
        this.beatIntervalMs = interval;
        if (!this.dead && this.isLeader()) this.scheduleNext(at + interval, true);
      }
      // Deduplicada (200): nada a antecipar — a próxima do ciclo leva a
      // lista atual.
      hub.deliver(result.viewers);
    }
    return result;
  }

  private onUnauthorizedResponse(): void {
    const ended = this.env.onUnauthorized ? this.env.onUnauthorized() : true;
    if (ended) this.halt();
  }

  /** Sessão encerrada: para tudo, sem retry nem flush (daria 401 de novo). */
  private halt(): void {
    if (this.halted) return;
    this.halted = true;
    this.pending = 0;
    this.clearNext();
    if (this.forwardTimer) clearTimeout(this.forwardTimer);
    this.forwardTimer = null;
    while (this.offs.length) this.offs.pop()?.();
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
    if (this.dead) return;
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

  /**
   * `pagehide`: o que ainda não saiu não se perde. Líder SEM seguidoras =
   * última aba do navegador: com o beat, uma batida final por `sendBeacon`
   * com `entities: []` (o backend tira o navegador de todas as entidades).
   * Com outras abas abertas, a próxima líder bate na cadência sem as
   * entidades desta.
   */
  private onSuspend(wasLeader: boolean): void {
    this.flushPending(wasLeader);
    if (!wasLeader || this.halted || !this.usingBeat() || !this.env.finalBeacon) return;
    const tabs = this.env.tabs;
    if (tabs && tabs.followerStates().size > 0) return;
    if (this.env.isSessionEnded?.()) return;
    try {
      this.env.finalBeacon({
        lastInteractionAt: this.env.idle?.lastInteractionAt() ?? null,
        entities: [],
      });
    } catch {
      /* beacon é best-effort */
    }
  }

  private flushPending(asLeader: boolean): void {
    const count = this.pending;
    if (count <= 0 || this.halted) return;
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

function retryAfterOf(result: PresenceCallResult | void): number {
  if (result?.status !== 429) return 0;
  const ms = result.retryAfterMs;
  // 429 sem prazo legível: uma janela inteira.
  return typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : PRESENCE_TICK_MS;
}

// ── Ambiente do navegador ────────────────────────────────────────────

/** Cabeçalho com o id da aba: o backend limita o ping por usuário e aba. */
export const PRESENCE_TAB_ID_HEADER = "x-tab-id";

let isolatedTabId: string | null = null;

/** Id estável desta aba: o do `tab-coordinator` ou, sem coordenação, um por carga. */
export function presenceTabId(tabs: TabCoordinator | null): string {
  if (tabs) return tabs.tabId;
  isolatedTabId ??=
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffff).toString(36)}`;
  return isolatedTabId;
}

/**
 * Status e, num 429, o prazo: `retryAfterMs` do corpo ou `Retry-After`
 * (segundos; nem sempre legível por CORS).
 */
export async function readPresenceResponse(res: Response): Promise<PresenceCallResult> {
  const result: PresenceCallResult = { status: res.status };
  if (res.ok) {
    // 200 do ping: limite de ociosidade (ausente no backend antigo).
    try {
      const body = (await res.json()) as { sessionIdleMs?: unknown } | null;
      const ms = body?.sessionIdleMs;
      if (typeof ms === "number" && Number.isFinite(ms) && ms > 0) result.sessionIdleMs = ms;
    } catch {
      /* corpo vazio/não-JSON */
    }
    return result;
  }
  if (res.status !== 429) return result;
  try {
    const body = (await res.json()) as { retryAfterMs?: unknown };
    if (typeof body.retryAfterMs === "number" && body.retryAfterMs > 0) {
      result.retryAfterMs = body.retryAfterMs;
      return result;
    }
  } catch {
    /* corpo não-JSON */
  }
  const seconds = Number(res.headers.get("Retry-After"));
  if (Number.isFinite(seconds) && seconds > 0) result.retryAfterMs = Math.round(seconds * 1_000);
  return result;
}

export async function postPresencePing(
  tabId: string,
  fetchImpl: typeof fetch = fetch,
  lastInteractionAt: number | null = null,
): Promise<PresenceCallResult> {
  const res = await fetchImpl(apiUrl("/api/agents/me/ping"), {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { [PRESENCE_TAB_ID_HEADER]: tabId, "Content-Type": "application/json" },
    // Sem registro de interação (storage bloqueado e nada nesta aba): `{}`.
    body: JSON.stringify(lastInteractionAt != null ? { lastInteractionAt } : {}),
  });
  return readPresenceResponse(res);
}

/**
 * `POST /api/presence/beat`: presença do navegador numa batida só (corpo
 * `{ tabId, lastInteractionAt, entities }`). 200 → `{ ok, sessionIdleMs,
 * nextBeatMs, viewers, deduped? }`.
 */
export async function postPresenceBeat(
  tabId: string,
  body: PresenceBeatBody,
  fetchImpl: typeof fetch = fetch,
  clientId: string = presenceClientId(),
): Promise<PresenceCallResult> {
  const res = await fetchImpl(apiUrl("/api/presence/beat"), {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: { [PRESENCE_TAB_ID_HEADER]: tabId, "Content-Type": "application/json" },
    body: JSON.stringify({
      tabId,
      clientId,
      ...(body.lastInteractionAt != null ? { lastInteractionAt: body.lastInteractionAt } : {}),
      entities: body.entities,
    }),
  });
  if (!res.ok) return readPresenceResponse(res);
  const result: PresenceCallResult = { status: res.status };
  try {
    const json = (await res.json()) as {
      sessionIdleMs?: unknown;
      nextBeatMs?: unknown;
      viewers?: unknown;
      deduped?: unknown;
      retryAfterMs?: unknown;
    } | null;
    const idle = json?.sessionIdleMs;
    if (typeof idle === "number" && Number.isFinite(idle) && idle > 0) result.sessionIdleMs = idle;
    const next = json?.nextBeatMs;
    if (typeof next === "number" && Number.isFinite(next) && next > 0) result.nextBeatMs = next;
    if (json?.viewers && typeof json.viewers === "object") result.viewers = json.viewers;
    if (json?.deduped === true) {
      result.deduped = true;
      const wait = json.retryAfterMs;
      if (typeof wait === "number" && Number.isFinite(wait) && wait > 0) result.retryAfterMs = wait;
    }
  } catch {
    /* corpo vazio/não-JSON: segue como sucesso */
  }
  return result;
}

/** localStorage: id estável DESTE navegador para o beat (`clientId`). */
export const PRESENCE_CLIENT_ID_STORAGE_KEY = "crm:presence-client-id";

let pageClientId: string | null = null;

function randomId(): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.floor(Math.random() * 0xffffffff).toString(36)}`;
}

/**
 * `clientId` do beat: o backend remove as entidades que saíram POR
 * navegador, então todas as abas usam o mesmo id (gravado no storage).
 * Storage bloqueado: um id por página.
 */
export function presenceClientId(): string {
  try {
    const stored = window.localStorage.getItem(PRESENCE_CLIENT_ID_STORAGE_KEY);
    if (stored && /^[A-Za-z0-9_-]{8,128}$/.test(stored)) return stored;
    const id = randomId();
    window.localStorage.setItem(PRESENCE_CLIENT_ID_STORAGE_KEY, id);
    return id;
  } catch {
    pageClientId ??= randomId();
    return pageClientId;
  }
}

/**
 * Batida final da última aba (`pagehide`): `sendBeacon` same-origin (o
 * rewrite `/api/*` do Next leva ao backend; sem CORS nem cabeçalho — o
 * `tabId` vai no corpo).
 */
export function sendFinalBeatBeacon(tabId: string, body: PresenceBeatBody): void {
  if (typeof navigator === "undefined" || typeof navigator.sendBeacon !== "function") return;
  const payload = JSON.stringify({
    tabId,
    clientId: presenceClientId(),
    ...(body.lastInteractionAt != null ? { lastInteractionAt: body.lastInteractionAt } : {}),
    entities: body.entities,
  });
  navigator.sendBeacon(PRESENCE_BEAT_PATH, new Blob([payload], { type: "application/json" }));
}

export const PRESENCE_BEAT_PATH = "/api/presence/beat";

async function postActivity(interactionCount: number): Promise<PresenceCallResult> {
  const res = await fetch(apiUrl("/api/agents/me/activity"), {
    method: "POST",
    keepalive: true,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ interactionCount }),
  });
  return readPresenceResponse(res);
}

function readStoredNumber(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    const at = raw ? Number(raw) : NaN;
    return Number.isFinite(at) ? at : null;
  } catch {
    return null;
  }
}

function writeStoredNumber(key: string, at: number): void {
  try {
    window.localStorage.setItem(key, String(at));
  } catch {
    /* storage bloqueado: só o estado desta aba */
  }
}

function browserIdleEnv(): PresenceIdleEnv | undefined {
  const clock = sessionIdleClock();
  if (!clock) return undefined;
  return {
    lastInteractionAt: () => clock.lastInteractionAt(),
    isExpired: () => clock.isIdleExpired(),
    setLimitMs: (ms) => clock.setIdleLimitMs(ms),
    onExpired: endIdleSession,
  };
}

export function browserPresenceTickerEnv(): PresenceTickerEnv {
  const tabs = isSingleLeaderEnabled() ? tabCoordinatorFor("crm") : null;
  const tabId = presenceTabId(tabs);
  return {
    tabs,
    ping: (lastInteractionAt) => postPresencePing(tabId, fetch, lastInteractionAt),
    activity: postActivity,
    beat: (body) => postPresenceBeat(tabId, body),
    hub: presenceBeatHub(),
    finalBeacon: (body) => sendFinalBeatBeacon(tabId, body),
    // Qualquer 401 encerra; só a renovação da própria sessão não.
    onUnauthorized: () => handleUnauthorized() !== "renewal",
    isSessionEnded,
    // Sem coordenação cada aba é líder de si mesma: o instante compartilhado
    // faria uma aba calar a outra (e a contagem dela não sairia).
    readLastTick: tabs ? () => readStoredNumber(PRESENCE_LAST_TICK_STORAGE_KEY) : undefined,
    writeLastTick: tabs
      ? (at) => writeStoredNumber(PRESENCE_LAST_TICK_STORAGE_KEY, at)
      : undefined,
    // O 429 é do usuário (teto por usuário), não da aba: vale para todas.
    readHoldUntil: () => readStoredNumber(PRESENCE_HOLD_UNTIL_STORAGE_KEY),
    writeHoldUntil: (at) => writeStoredNumber(PRESENCE_HOLD_UNTIL_STORAGE_KEY, at),
    idle: browserIdleEnv(),
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
  // Logout disparado por outra aba: esta para e vai ao login também.
  watchSessionEndInOtherTabs();
  // Recarga do Serwist no `online` é automática: marca antes.
  watchOnlineAutoReload();
  // Antes do 1º tique (que confere a ociosidade): abrir a página conta —
  // menos numa recarga automática, que só confere o limite.
  notePageOpen();
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
