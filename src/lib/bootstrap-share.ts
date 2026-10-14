/**
 * Bootstrap compartilhado entre abas do mesmo navegador.
 *
 * Aba nova (ex.: link `/pipeline?deal=` aberto com o CRM já aberto em
 * outra aba) pergunta às abas abertas, por `BroadcastChannel`, se alguma
 * tem o `GET /api/me/bootstrap` do MESMO usuário/org obtido há menos de
 * `BOOTSTRAP_SHARE_MAX_AGE_MS` (60 s). Tendo, semeia dele e não chama a
 * rede; não tendo, chama (o navegador revalida → 304).
 *
 *  - Só pergunta quando `localStorage` diz que alguma aba deste usuário
 *    obteve o bootstrap há menos de 60 s (`BOOTSTRAP_SHARE_HINT_KEY`):
 *    sem isso a abertura não espera nada. Com a dica, espera no máximo
 *    `BOOTSTRAP_SHARE_WAIT_MS` pela resposta.
 *  - Seguro por usuário/org: a pergunta e a resposta levam a identidade
 *    `userId|organizationId`; mensagem de outra identidade é ignorada dos
 *    dois lados, e o payload recebido é validado (formato, `user.id` e
 *    org) como o da rede. O canal é do origin (cada tenant tem o seu).
 *  - A idade é a da busca na rede (`at`): repassar não renova os 60 s.
 *  - Payload v1 (voláteis no próprio bootstrap): a aba que responde troca
 *    os voláteis pelo que tem em cache agora (SSE e polls os mantêm em
 *    dia). Na v2 os voláteis vêm do `/api/me/live`.
 *
 * O `GET /api/me/live` usa o mesmo mecanismo (canal `crm:live-share`,
 * dica `crm:live-shared`), com validade de `LIVE_SHARE_MAX_AGE_MS` (30 s,
 * o cache de presença do backend): aba nova com outra que buscou o live
 * há menos de 30 s não chama a rede; quem responde troca os voláteis pelo
 * que tem em cache agora (status do agente, e-mail, salas do chat).
 */

import type { QueryClient } from "@tanstack/react-query";

import {
  isValidPayload,
  setLiveSource,
  setStableBootstrapSource,
  shellBootstrapKeys,
  type LiveSource,
  type MeBootstrapPayload,
  type MeLivePayload,
  type ShellBootstrapIdentity,
  type StableBootstrapSource,
} from "@/lib/shell-bootstrap";

export const BOOTSTRAP_SHARE_CHANNEL = "crm:bootstrap-share";
export const BOOTSTRAP_SHARE_MAX_AGE_MS = 60_000;
export const BOOTSTRAP_SHARE_WAIT_MS = 150;
/** `"<at>|<userId>|<orgId>"`: última busca do bootstrap na rede, por identidade. */
export const BOOTSTRAP_SHARE_HINT_KEY = "crm:bootstrap-shared";
export const LIVE_SHARE_CHANNEL = "crm:live-share";
export const LIVE_SHARE_MAX_AGE_MS = 30_000;
export const LIVE_SHARE_HINT_KEY = "crm:live-shared";

const TEAM_CHAT_ROOMS_URL = "/api/team-chat/rooms";

type AskMessage = { v: 1; t: "ask"; id: string; k: string };
type OfferMessage = {
  v: 1;
  t: "offer";
  id: string;
  k: string;
  at: number;
  payload: unknown;
};
type ShareMessage = AskMessage | OfferMessage;

export interface ShareChannelLike {
  postMessage(message: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface BootstrapShareEnv {
  createChannel: () => ShareChannelLike | null;
  readHint: () => string | null;
  writeHint: (value: string) => void;
  now?: () => number;
  newId?: () => string;
}

export type SharedBootstrap<T = MeBootstrapPayload> = { payload: T; at: number };

export type TabShareOptions<T> = {
  /** Validade do que é repassado (a partir da busca na rede). */
  maxAgeMs: number;
  /** O payload recebido serve a esta identidade? */
  accept: (payload: unknown, identity: ShellBootstrapIdentity) => payload is T;
};

export function shareIdentityKey(identity: ShellBootstrapIdentity): string {
  return `${identity.userId}|${identity.organizationId ?? ""}`;
}

/** O payload é desta identidade (mesma checagem do bootstrap da rede + org)? */
function payloadMatches(payload: unknown, identity: ShellBootstrapIdentity): payload is MeBootstrapPayload {
  if (!isValidPayload(payload)) return false;
  if (payload.user.id !== identity.userId) return false;
  return (payload.user.organizationId ?? null) === (identity.organizationId ?? null);
}

export class BootstrapShare<T = MeBootstrapPayload> {
  private channel: ShareChannelLike | null = null;
  private channelTried = false;
  private held: { k: string; at: number; snapshot: () => T } | null = null;
  private readonly waiters = new Map<string, (offer: OfferMessage) => void>();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly opts: TabShareOptions<T>;

  constructor(
    private readonly env: BootstrapShareEnv,
    opts?: TabShareOptions<T>,
  ) {
    this.opts = opts ?? ({
      maxAgeMs: BOOTSTRAP_SHARE_MAX_AGE_MS,
      accept: payloadMatches,
    } as unknown as TabShareOptions<T>);
    this.now = env.now ?? Date.now;
    this.newId =
      env.newId ??
      (() =>
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  }

  private ensureChannel(): ShareChannelLike | null {
    if (this.channelTried) return this.channel;
    this.channelTried = true;
    try {
      this.channel = this.env.createChannel();
    } catch {
      this.channel = null;
    }
    if (this.channel) this.channel.onmessage = (ev) => this.handle(ev.data);
    return this.channel;
  }

  private fresh(at: number): boolean {
    const age = this.now() - at;
    return Number.isFinite(age) && age >= 0 && age < this.opts.maxAgeMs;
  }

  /** Alguma aba deste navegador buscou o bootstrap desta identidade há < 60 s? */
  private hintIsFresh(k: string): boolean {
    let raw: string | null = null;
    try {
      raw = this.env.readHint();
    } catch {
      return false;
    }
    if (!raw) return false;
    const sep = raw.indexOf("|");
    if (sep <= 0) return false;
    return raw.slice(sep + 1) === k && this.fresh(Number(raw.slice(0, sep)));
  }

  /**
   * Esta aba tem o bootstrap de `k` obtido em `at` e responde a quem
   * perguntar (enquanto tiver menos de 60 s). `fromNetwork` grava a dica.
   */
  hold(k: string, at: number, snapshot: () => T, fromNetwork: boolean): void {
    this.held = { k, at, snapshot };
    if (!this.ensureChannel()) return;
    if (!fromNetwork) return;
    try {
      this.env.writeHint(`${at}|${k}`);
    } catch {
      /* storage bloqueado: as outras abas só não perguntam */
    }
  }

  /** Pergunta às outras abas; `null` sem resposta válida a tempo. */
  ask(identity: ShellBootstrapIdentity): Promise<SharedBootstrap<T> | null> {
    const k = shareIdentityKey(identity);
    if (!this.hintIsFresh(k)) return Promise.resolve(null);
    const channel = this.ensureChannel();
    if (!channel) return Promise.resolve(null);
    const id = this.newId();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        resolve(null);
      }, BOOTSTRAP_SHARE_WAIT_MS);
      this.waiters.set(id, (offer) => {
        if (offer.k !== k || !this.fresh(offer.at)) return;
        if (!this.opts.accept(offer.payload, identity)) return;
        clearTimeout(timer);
        this.waiters.delete(id);
        resolve({ payload: offer.payload, at: offer.at });
      });
      try {
        channel.postMessage({ v: 1, t: "ask", id, k } satisfies AskMessage);
      } catch {
        clearTimeout(timer);
        this.waiters.delete(id);
        resolve(null);
      }
    });
  }

  private handle(raw: unknown): void {
    const msg = raw as ShareMessage | null;
    if (!msg || typeof msg !== "object" || msg.v !== 1 || typeof msg.id !== "string") return;
    if (msg.t === "offer") {
      this.waiters.get(msg.id)?.(msg);
      return;
    }
    if (msg.t !== "ask") return;
    const held = this.held;
    // Outra identidade (outro usuário/org neste navegador): não responde.
    if (!held || held.k !== msg.k || !this.fresh(held.at)) return;
    let payload: T;
    try {
      payload = held.snapshot();
    } catch {
      return;
    }
    try {
      this.channel?.postMessage({
        v: 1,
        t: "offer",
        id: msg.id,
        k: held.k,
        at: held.at,
        payload,
      } satisfies OfferMessage);
    } catch {
      /* canal fechado */
    }
  }

  destroy(): void {
    this.channel?.close();
    this.channel = null;
    this.held = null;
    this.waiters.clear();
  }
}

/**
 * Cópia do payload para outra aba. Bootstrap v1 traz os voláteis: vão os
 * valores que esta aba tem em cache AGORA (mantidos por SSE/polls), não
 * os de até 60 s atrás.
 */
export function shareSnapshot(
  client: QueryClient,
  base: MeBootstrapPayload,
): MeBootstrapPayload {
  const out: MeBootstrapPayload = { ...base };
  if (base.blocks) out.blocks = { ...base.blocks };
  const userId = base.user.id;
  if (base.agentStatus) {
    const current = client.getQueryData(shellBootstrapKeys.agentStatus(userId));
    if (current && typeof current === "object") {
      out.agentStatus = { ...base.agentStatus, ...(current as object) };
    }
  }
  if (base.emailUnread) {
    const current = client.getQueryData(shellBootstrapKeys.navEmailAccounts());
    if (Array.isArray(current)) {
      const accounts = current as { id: string; email: string; unreadCount: number }[];
      out.emailUnread = {
        totalUnread: accounts.reduce((n, a) => n + (a.unreadCount || 0), 0),
        accounts,
      };
    }
  }
  if (out.blocks && Object.prototype.hasOwnProperty.call(out.blocks, TEAM_CHAT_ROOMS_URL)) {
    const current = client.getQueryData(["team-chat-rooms"]);
    if (current) out.blocks[TEAM_CHAT_ROOMS_URL] = current;
  }
  return out;
}

/** Fonte do estável: outra aba (< 60 s, mesma identidade) ou a rede. */
export function sharedStableSource(share: BootstrapShare, now: () => number = Date.now): StableBootstrapSource {
  return async (identity, fetchFromNetwork, client) => {
    const k = shareIdentityKey(identity);
    const shared = await share.ask(identity).catch(() => null);
    if (shared) {
      const payload = shared.payload;
      share.hold(k, shared.at, () => shareSnapshot(client(), payload), false);
      return payload;
    }
    const payload = await fetchFromNetwork();
    if (payload) share.hold(k, now(), () => shareSnapshot(client(), payload), true);
    return payload;
  };
}

/** O live recebido é desta identidade (sem `user` ou com o mesmo id)? */
function liveMatches(payload: unknown, identity: ShellBootstrapIdentity): payload is MeLivePayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const user = (payload as MeLivePayload).user;
  return !user?.id || user.id === identity.userId;
}

/** Cópia do live para outra aba, com os voláteis do cache de AGORA. */
export function liveShareSnapshot(
  client: QueryClient,
  base: MeLivePayload,
  userId: string,
): MeLivePayload {
  const out: MeLivePayload = { ...base, user: { id: userId } };
  if (base.blocks) out.blocks = { ...base.blocks };
  const status = client.getQueryData(shellBootstrapKeys.agentStatus(userId));
  if (status && typeof status === "object") {
    if (base.agentStatus) out.agentStatus = { ...base.agentStatus, ...(status as object) };
    const statusUrl = `/api/agents/${userId}/status`;
    if (out.blocks && isRecord(out.blocks[statusUrl])) {
      out.blocks[statusUrl] = { ...(out.blocks[statusUrl] as object), ...(status as object) };
    }
  }
  const accounts = client.getQueryData(shellBootstrapKeys.navEmailAccounts());
  if (base.emailUnread && Array.isArray(accounts)) {
    const list = accounts as { id: string; email: string; unreadCount: number }[];
    out.emailUnread = { totalUnread: list.reduce((n, a) => n + (a.unreadCount || 0), 0), accounts: list };
  }
  const rooms = client.getQueryData(["team-chat-rooms"]);
  if (rooms && out.blocks && Object.prototype.hasOwnProperty.call(out.blocks, TEAM_CHAT_ROOMS_URL)) {
    out.blocks[TEAM_CHAT_ROOMS_URL] = rooms;
  }
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export function newLiveShare(env: BootstrapShareEnv): BootstrapShare<MeLivePayload> {
  return new BootstrapShare<MeLivePayload>(env, {
    maxAgeMs: LIVE_SHARE_MAX_AGE_MS,
    accept: liveMatches,
  });
}

/** Fonte do live: outra aba (< 30 s, mesma identidade) ou a rede. */
export function sharedLiveSource(
  share: BootstrapShare<MeLivePayload>,
  now: () => number = Date.now,
): LiveSource {
  return async (identity, fetchFromNetwork, client) => {
    const k = shareIdentityKey(identity);
    const shared = await share.ask(identity).catch(() => null);
    if (shared) {
      const live = shared.payload;
      share.hold(k, shared.at, () => liveShareSnapshot(client(), live, identity.userId), false);
      return live;
    }
    const live = await fetchFromNetwork();
    if (live) share.hold(k, now(), () => liveShareSnapshot(client(), live, identity.userId), true);
    return live;
  };
}

export function browserBootstrapShareEnv(
  channel: string = BOOTSTRAP_SHARE_CHANNEL,
  hintKey: string = BOOTSTRAP_SHARE_HINT_KEY,
): BootstrapShareEnv {
  return {
    createChannel: () =>
      typeof BroadcastChannel === "function"
        ? (new BroadcastChannel(channel) as unknown as ShareChannelLike)
        : null,
    readHint: () => window.localStorage.getItem(hintKey),
    writeHint: (value) => window.localStorage.setItem(hintKey, value),
  };
}

let installed: BootstrapShare | null = null;
let installedLive: BootstrapShare<MeLivePayload> | null = null;

/** Liga o compartilhamento (bootstrap e live) nesta página (idempotente; só no navegador). */
export function installBootstrapShare(env?: BootstrapShareEnv, liveEnv?: BootstrapShareEnv): BootstrapShare | null {
  if (typeof window === "undefined") return null;
  if (installed && !env) return installed;
  installed?.destroy();
  installedLive?.destroy();
  installed = new BootstrapShare(env ?? browserBootstrapShareEnv());
  installedLive = newLiveShare(liveEnv ?? browserBootstrapShareEnv(LIVE_SHARE_CHANNEL, LIVE_SHARE_HINT_KEY));
  setStableBootstrapSource(sharedStableSource(installed));
  setLiveSource(sharedLiveSource(installedLive));
  return installed;
}

/** Só para testes. */
export function uninstallBootstrapShare(): void {
  installed?.destroy();
  installedLive?.destroy();
  installed = null;
  installedLive = null;
  setStableBootstrapSource(null);
  setLiveSource(null);
}
