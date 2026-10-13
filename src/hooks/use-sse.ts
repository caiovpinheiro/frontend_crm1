"use client";

import { apiUrl } from "@/lib/api";
import {
  handleUnauthorized,
  isSessionEnded,
  watchSessionEndInOtherTabs,
} from "@/lib/session-revoked";
import { useEffect, useRef, useSyncExternalStore } from "react";

import { isSingleLeaderEnabled } from "./sse-single-leader";
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
 *
 * Stream parado (N-MA-1): conexão meio-aberta (proxy, rede móvel, Safari)
 * não dispara `onerror` — a aba ficaria "conectada" sem receber nada. A
 * líder vigia a atividade (abertura, eventos e o batimento do servidor):
 * sem nada por 2× o intervalo do batimento (`SSE_STALE_AFTER_MS`) marca
 * a conexão como desconectada (as seguidoras sabem pelo `status`) e
 * reconecta. O vigia só arma depois de ver UM batimento nomeado
 * (`event: heartbeat`): o comentário `: heartbeat` que o backend manda
 * hoje não chega ao JavaScript (o `EventSource` descarta comentários), e
 * sem batimento visível um stream calmo seria confundido com um parado.
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

/** Intervalo do batimento do servidor (`SSE_HEARTBEAT_MS` no backend). */
export const SSE_SERVER_HEARTBEAT_MS = 25_000;
/** Sem nenhuma atividade por este tempo, a conexão está parada. */
export const SSE_STALE_AFTER_MS = 2 * SSE_SERVER_HEARTBEAT_MS;
/** Evento nomeado do batimento do servidor (o comentário não é visível). */
export const SSE_HEARTBEAT_EVENT = "heartbeat";
const SSE_STALE_CHECK_MS = 5_000;

const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;
const RECONNECT_JITTER = 0.3;

/** Espera da tentativa `attempt` (0 = primeira): exponencial + jitter. */
export function sseReconnectDelayMs(attempt: number, random = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = 1 + (random() * 2 - 1) * RECONNECT_JITTER;
  return Math.round(base * jitter);
}

/**
 * Teto de conexões do backend (`src/lib/sse-connection-limit.ts`):
 *  - por usuário: a conexão MAIS ANTIGA recebe este evento
 *    (`{ reason, retryAfterMs }`) e é fechada pelo servidor. Reconectar na
 *    hora derrubaria a conexão seguinte, em rodízio — então a líder fecha,
 *    fica "evicted" e só volta depois de ≥ 60s (com jitter) ou quando o
 *    usuário volta à aba depois desse prazo. A liderança NÃO muda: as
 *    seguidoras ficam sem SSE até a líder voltar (os polls de fallback
 *    cobrem).
 *  - por organização: handshake recusado com 429 + `Retry-After`.
 * Sessão revogada/expirada: handshake recusado com 401 (com ou sem
 * `code`) — a conexão PARA de vez, sem retry nem backoff (nem com o
 * usuário voltando à aba), e o logout sai pelo caminho único de
 * `lib/session-revoked.ts`. Só durante a renovação da própria sessão
 * (troca de senha) o 401 é esperado: aí confere de novo quando o usuário
 * volta à aba (≥ 60s depois).
 */
export const SSE_EVICTED_EVENT = "sse_connection_evicted";
/**
 * Teto por usuário (contrato novo): passando de 3 conexões, o servidor
 * fecha a MAIS ANTIGA com `event: superseded` /
 * `data: {"code":"SSE_SUPERSEDED"}` — no mesmo bloco, ANTES do legado
 * `sse_connection_evicted` (para o front antigo). Aqui o `superseded`
 * fecha a conexão na hora, então o legado nem é entregue (o
 * `EventSource` fechado não despacha mais eventos). Reconectar sozinha derrubaria outra
 * conexão do mesmo usuário (outro navegador/dispositivo), em rodízio —
 * então a líder fecha e entra em "modo sem tempo real" (`paused`): não
 * reconecta por timer nem quando o usuário volta à aba. Só o botão
 * "reconectar" (`resumeSSE`) abre de novo — e aí pode derrubar outra.
 * As seguidoras sabem pelo `status` (`paused: true`) e pedem a
 * reconexão à líder (`sse-resume`). Enquanto pausada, a tela refaz as
 * queries ativas no foco e a cada 60 s (`RealtimePausedNotice`).
 */
export const SSE_SUPERSEDED_EVENT = "superseded";
export const SSE_EVICTED_MIN_RETRY_MS = 60_000;
/** `Retry-After` ilegível (CORS sem expose) num 429: assume o default do backend. */
export const SSE_ORG_LIMIT_DEFAULT_RETRY_MS = 35_000;
export const SSE_UNAUTHORIZED_RECHECK_MS = 60_000;
const HOLD_JITTER = 0.3;

export type SseHoldReason = "evicted" | "unauthorized" | "session-ended" | "superseded";

/** Resultado da sondagem HTTP depois de um handshake recusado. */
export type SseProbeResult = {
  status: number;
  /** `Retry-After` em ms, quando legível. */
  retryAfterMs?: number;
  /** `code` do corpo JSON (ex.: `SESSION_REVOKED`). */
  code?: string;
};

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
  /**
   * O `EventSource` não expõe status nem cabeçalhos. Quando o handshake
   * falha SEM abrir, uma sondagem `fetch` lê o status (401/429) e o
   * `Retry-After`. `null` = erro de rede/desconhecido (backoff normal).
   */
  probe?: (url: string) => Promise<SseProbeResult | null>;
  /** Usuário voltou à aba (foco / ficou visível) — devolve o unsubscribe. */
  onUserActive?: (fn: () => void) => () => void;
  /**
   * 401 no handshake (com ou sem `code`). Devolve `true` quando a sessão
   * acabou (a conexão para de vez); `false` = 401 esperado (renovação da
   * sessão em andamento): confere de novo quando o usuário volta à aba.
   * Sem o callback, qualquer 401 para de vez.
   */
  onUnauthorized?: (code?: string) => boolean;
  /** A sessão já acabou (logout nesta ou em outra aba): não conecta. */
  isSessionEnded?: () => boolean;
  random?: () => number;
}

type StatusListener = (open: boolean) => void;
type PausedListener = (paused: boolean) => void;

class SharedSSEConnection {
  private es: EventSourceLike | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly attached = new Set<string>();
  private readonly subscribers = new Map<SSEHandler, ReadonlySet<string>>();
  private readonly reconnectHandlers = new Set<SSEReconnectHandler>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly pausedListeners = new Set<PausedListener>();
  /** Seguidora: a líder avisou que está pausada (`superseded`). */
  private remotePaused = false;
  /** Eventos pedidos pelas seguidoras (cache; recalculado em `refresh`). */
  private followerNeeds = new Set<string>();
  /** Só dispara `onReconnect` depois de um open bem-sucedido + gap. */
  private everOpened = false;
  private sawGap = false;
  /** Falhas seguidas desde o último open (backoff). */
  private failures = 0;
  /** Estado da conexão como esta aba o conhece (própria ou da líder). */
  private open = false;
  /** Líder: não reconectar antes de `until` (despejo / 401). */
  private hold: { reason: SseHoldReason; until: number } | null = null;
  /** Sondagem HTTP em andamento (handshake recusado). */
  private probing = false;
  /** Última atividade do stream (open, evento, batimento). */
  private lastActivityAt = 0;
  /** O servidor manda batimento nomeado: só então o vigia de stream parado arma. */
  private heartbeatSupported = false;
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly url: string,
    private readonly env: SseEnv,
  ) {}

  get connected(): boolean {
    return this.open;
  }

  /** Por que a líder não está reconectando (`null` = fluxo normal). */
  get holdReason(): SseHoldReason | null {
    return this.hold?.reason ?? null;
  }

  /**
   * "Modo sem tempo real": a conexão desta aba (ou da líder) foi
   * substituída (`superseded`) e só volta pelo `resume()`.
   */
  get paused(): boolean {
    return this.isLeader() ? this.hold?.reason === "superseded" : this.remotePaused;
  }

  onPausedChange(fn: PausedListener): () => void {
    this.pausedListeners.add(fn);
    return () => this.pausedListeners.delete(fn);
  }

  private emitPaused(): void {
    const paused = this.paused;
    for (const fn of this.pausedListeners) {
      try {
        fn(paused);
      } catch {
        /* isola */
      }
    }
  }

  /**
   * Usuário pediu para reconectar (botão do aviso). Líder: sai da pausa e
   * conecta já. Seguidora: pede à líder (é ela quem tem a conexão).
   */
  resume(): void {
    if (!this.isLeader()) {
      this.tabs?.post({ t: "sse-resume", url: this.url });
      return;
    }
    if (this.hold?.reason !== "superseded") return;
    this.hold = null;
    this.failures = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.emitPaused();
    this.postStatus();
    this.refresh();
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
      // A líder anterior estava pausada (`superseded`): a nova herda a
      // pausa — abrir sozinha derrubaria outra conexão do usuário.
      if (this.remotePaused) {
        this.remotePaused = false;
        this.hold = { reason: "superseded", until: Number.POSITIVE_INFINITY };
      }
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
  applyRemoteStatus(open: boolean, paused = false): void {
    if (this.isLeader()) return;
    const pausedNow = paused && !open;
    if (pausedNow !== this.remotePaused) {
      this.remotePaused = pausedNow;
      this.emitPaused();
    }
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
    this.tabs.post({ t: "status", url: this.url, open: this.open, paused: this.paused });
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
      this.tabs.post({ t: "status", url: this.url, open, paused: this.paused });
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
    if (this.es || this.probing) return;
    if (!this.isLeader() || this.neededEvents().size === 0) return;
    if (this.env.isSessionEnded?.()) {
      this.hold = { reason: "session-ended", until: Number.POSITIVE_INFINITY };
    }
    if (this.hold) {
      // Sessão encerrada: nunca mais. 401 esperado (renovação): só o
      // usuário voltando à aba libera (`onUserActive`).
      if (this.hold.reason !== "evicted") return;
      const remaining = this.hold.until - Date.now();
      if (remaining > 0) {
        if (!this.retryTimer) this.scheduleRetry(remaining);
        return;
      }
      this.hold = null;
    }
    let es: EventSourceLike;
    try {
      es = this.env.createEventSource(this.url);
    } catch {
      // Sem `EventSource` (SSR, ambiente de teste sem browser): nada a abrir.
      return;
    }
    this.es = es;
    /** Este handshake chegou a abrir? Falha sem abrir = recusado (401/429/5xx). */
    let opened = false;
    this.attachMissing(this.neededEvents());
    es.addEventListener(SSE_EVICTED_EVENT, (e) => this.onEvicted(es, e));
    es.addEventListener(SSE_SUPERSEDED_EVENT, () => this.onSuperseded(es));
    es.addEventListener(SSE_HEARTBEAT_EVENT, () => {
      if (this.es !== es) return;
      this.heartbeatSupported = true;
      this.touch();
    });
    this.touch();
    this.startStaleWatch();
    es.onopen = () => {
      opened = true;
      this.failures = 0;
      this.touch();
      this.setOpen(true, true);
      this.afterOpen();
    };
    es.onerror = () => {
      es.close();
      if (this.es !== es) return; // já tratado (despejo / teardown)
      if (this.everOpened) this.sawGap = true;
      this.es = null;
      this.stopStaleWatch();
      this.attached.clear();
      this.setOpen(false, true);
      if (this.retryTimer || this.neededEvents().size === 0) return;
      if (!this.isLeader()) return;
      if (!opened && this.env.probe) {
        void this.probeThenRetry();
        return;
      }
      this.scheduleRetry(sseReconnectDelayMs(this.failures));
      this.failures += 1;
    };
  }

  private touch(): void {
    this.lastActivityAt = Date.now();
  }

  private startStaleWatch(): void {
    if (this.staleTimer) return;
    this.staleTimer = setInterval(() => this.checkStale(), SSE_STALE_CHECK_MS);
  }

  private stopStaleWatch(): void {
    if (!this.staleTimer) return;
    clearInterval(this.staleTimer);
    this.staleTimer = null;
  }

  /**
   * Líder: nada (evento ou batimento) há `SSE_STALE_AFTER_MS` — o stream
   * parou sem `onerror`. Fecha, avisa as seguidoras e reconecta (backoff).
   */
  checkStale(): void {
    const es = this.es;
    if (!es || !this.heartbeatSupported) return;
    if (Date.now() - this.lastActivityAt < SSE_STALE_AFTER_MS) return;
    es.close();
    this.es = null;
    this.stopStaleWatch();
    this.attached.clear();
    if (this.everOpened) this.sawGap = true;
    this.setOpen(false, true);
    if (this.retryTimer || this.neededEvents().size === 0 || !this.isLeader()) return;
    this.scheduleRetry(sseReconnectDelayMs(this.failures));
    this.failures += 1;
  }

  private scheduleRetry(delayMs: number): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delayMs);
  }

  private holdDelay(baseMs: number): number {
    const random = this.env.random ?? Math.random;
    return Math.round(baseMs * (1 + random() * HOLD_JITTER));
  }

  /**
   * Handshake recusado: descobre o motivo (o `EventSource` não diz).
   * 401 → para (sessão revogada dispara o signOut); 429 → respeita o
   * `Retry-After`; o resto segue o backoff normal.
   */
  private async probeThenRetry(): Promise<void> {
    this.probing = true;
    let result: SseProbeResult | null = null;
    try {
      result = (await this.env.probe?.(this.url)) ?? null;
    } catch {
      result = null;
    }
    this.probing = false;
    if (this.es || this.retryTimer) return;
    if (!this.isLeader() || this.neededEvents().size === 0) return;

    if (result?.status === 401) {
      // Qualquer 401 (o backend antigo não manda `code`): sem retry.
      const ended = this.env.onUnauthorized ? this.env.onUnauthorized(result.code) : true;
      this.hold = ended
        ? { reason: "session-ended", until: Number.POSITIVE_INFINITY }
        : { reason: "unauthorized", until: Date.now() + SSE_UNAUTHORIZED_RECHECK_MS };
      return;
    }
    if (result?.status === 429) {
      const base = Math.max(1_000, result.retryAfterMs ?? SSE_ORG_LIMIT_DEFAULT_RETRY_MS);
      this.failures += 1;
      this.scheduleRetry(this.holdDelay(base)); // nunca antes do Retry-After
      return;
    }
    // Rede/5xx — ou 2xx (o servidor voltou entre a falha e a sondagem):
    // backoff normal; reconectar "já" num 2xx viraria laço se só o
    // EventSource estiver falhando.
    this.scheduleRetry(sseReconnectDelayMs(this.failures));
    this.failures += 1;
  }

  /** Teto por usuário: esta conexão era a mais antiga e foi fechada. */
  private onEvicted(es: EventSourceLike, e: Event): void {
    if (this.es !== es) return;
    let retryAfterMs = 0;
    try {
      const data = JSON.parse((e as MessageEvent).data as string) as {
        retryAfterMs?: unknown;
      };
      if (typeof data.retryAfterMs === "number") retryAfterMs = data.retryAfterMs;
    } catch {
      /* sem payload: vale o mínimo */
    }
    es.close();
    this.es = null;
    this.stopStaleWatch();
    this.attached.clear();
    if (this.everOpened) this.sawGap = true;
    const delay = this.holdDelay(Math.max(SSE_EVICTED_MIN_RETRY_MS, retryAfterMs));
    this.hold = { reason: "evicted", until: Date.now() + delay };
    this.setOpen(false, true);
    this.scheduleRetry(delay);
  }

  /**
   * Teto por usuário (contrato novo): esta conexão era a mais antiga e foi
   * substituída. Fecha e PAUSA — sem timer de volta (ver
   * `SSE_SUPERSEDED_EVENT`); `onUserActive` também não libera.
   */
  private onSuperseded(es: EventSourceLike): void {
    if (this.es !== es) return;
    es.close();
    this.es = null;
    this.stopStaleWatch();
    this.attached.clear();
    if (this.everOpened) this.sawGap = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.hold = { reason: "superseded", until: Number.POSITIVE_INFINITY };
    if (this.open) {
      this.setOpen(false, true);
    } else {
      this.postStatus();
    }
    this.emitPaused();
  }

  /**
   * Usuário voltou à aba: se o prazo do "evicted"/"unauthorized" já passou
   * (timer estrangulado em segundo plano, ou 401 sem timer), tenta de novo.
   */
  onUserActive(): void {
    // Timers estrangulados em segundo plano: confere o stream na volta.
    this.checkStale();
    if (!this.hold || Date.now() < this.hold.until) return;
    this.hold = null;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.refresh();
  }

  private teardown(): void {
    this.cancelIdleClose();
    this.stopStaleWatch();
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
    this.touch();
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
    if (env.onUserActive) {
      this.offs.push(
        env.onUserActive(() => {
          for (const conn of this.connections.values()) conn.onUserActive();
        }),
      );
    }
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
          this.connection(msg.url).applyRemoteStatus(msg.open, msg.paused === true);
        } else if (msg.t === "sse-resume") {
          this.connections.get(msg.url)?.resume();
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

/**
 * Sondagem do handshake: um GET comum à mesma URL só para ler status,
 * `Retry-After` e o `code` do 401 — abortado em seguida (num 200 o stream
 * aberto é descartado na hora). Erro de rede/CORS → `null`.
 */
export async function probeSseHandshake(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SseProbeResult | null> {
  const ctrl = new AbortController();
  try {
    const res = await fetchImpl(url, {
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "text/event-stream" },
      signal: ctrl.signal,
    });
    const result: SseProbeResult = { status: res.status };
    const retryAfter = Number(res.headers.get("Retry-After"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      result.retryAfterMs = Math.round(retryAfter * 1_000);
    }
    if (res.status === 401) {
      try {
        const body = (await res.json()) as { code?: unknown };
        if (typeof body.code === "string") result.code = body.code;
      } catch {
        /* corpo não-JSON */
      }
    }
    return result;
  } catch {
    return null;
  } finally {
    ctrl.abort();
  }
}

function onBrowserUserActive(fn: () => void): () => void {
  if (typeof document === "undefined" || typeof window === "undefined") return () => {};
  const onVisibility = () => {
    if (document.visibilityState === "visible") fn();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", fn);
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("focus", fn);
  };
}

/**
 * Coordenador da conexão padrão. Com a chave desligada
 * (`sse-single-leader.ts`) devolve `null`: aba isolada, uma conexão por
 * aba — o comportamento anterior à líder entre abas.
 */
export function defaultSseTabs(
  enabled: boolean = isSingleLeaderEnabled(),
  create: () => TabCoordinator = () => tabCoordinatorFor("crm"),
): TabCoordinator | null {
  return enabled ? create() : null;
}

let defaultBridge: SseTabBridge | null = null;

function bridge(): SseTabBridge {
  if (!defaultBridge) {
    // Logout disparado por outra aba: esta para e vai ao login também.
    watchSessionEndInOtherTabs();
    defaultBridge = new SseTabBridge({
      // O DOM tipa `onopen`/`onerror` com `Event`; aqui os handlers o ignoram.
      createEventSource: (url) =>
        new EventSource(url, { withCredentials: true }) as unknown as EventSourceLike,
      tabs: defaultSseTabs(),
      probe: (url) => probeSseHandshake(url),
      onUserActive: onBrowserUserActive,
      // Qualquer 401 encerra; só a renovação da própria sessão não.
      onUnauthorized: () => handleUnauthorized() !== "renewal",
      isSessionEnded,
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

/** Conexão da `url` em "modo sem tempo real" (`superseded`)? */
export function isSSEPaused(url = "/api/sse/messages"): boolean {
  return bridge().connection(apiUrl(url)).paused;
}

export function subscribeSSEPaused(url: string, fn: PausedListener): () => void {
  return bridge().connection(apiUrl(url)).onPausedChange(fn);
}

/** Botão "reconectar" do aviso de tempo real pausado. */
export function resumeSSE(url = "/api/sse/messages"): void {
  bridge().connection(apiUrl(url)).resume();
}

/** `true` enquanto o tempo real desta aba está pausado (`superseded`). */
export function useSSEPaused(url = "/api/sse/messages"): boolean {
  return useSyncExternalStore(
    (onChange) => subscribeSSEPaused(url, onChange),
    () => isSSEPaused(url),
    () => false,
  );
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
