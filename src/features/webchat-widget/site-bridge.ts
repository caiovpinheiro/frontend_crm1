/**
 * Webchat v2 — ponte iframe ↔ loader (`public/webchat/embed.js`) do lado do
 * iframe. Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.1/§9.2.
 *
 *  - Handshake v2: o `hello` anuncia `protocol: 2` (o loader só manda
 *    mensagens v2 com isso); o resto é igual ao v1 (`handshakeWithParent`).
 *  - A ponte escuta desde ANTES do handshake e guarda o que chegar
 *    (`identify`, `context`, `track`, `flush`) até alguém assinar — o loader
 *    esvazia a fila logo depois do `ack`, antes de o widget terminar de
 *    carregar a config.
 *  - Toda mensagem: `event.source === window.parent` e
 *    `event.origin === host`; fora do formato ou grande demais → descartada
 *    em silêncio.
 */
import {
  WEBCHAT_NS,
  isWebchatMessage,
  type FrameToLoaderV2,
  type PageInfo,
  type WebchatContextPatch,
  type WebchatIdentifyPayload,
  type WebchatOpenOptions,
  type WebchatScalar,
  type WebchatTrackEvent,
} from "./protocol";

export const WEBCHAT_FRAME_PROTOCOL = 2 as const;

/** Teto do `identify` serializado (§9.2). */
export const MAX_IDENTIFY_BYTES = 8 * 1024;
/** Teto de qualquer mensagem do loader (o mesmo das rotas públicas). */
export const MAX_BRIDGE_MESSAGE_BYTES = 32 * 1024;
const MAX_MESSAGE_CHARS = 4000;
const MAX_REF_CHARS = 128;
const MAX_EVENTS_PER_MESSAGE = 50;

export type BridgeMessage =
  | { type: "identify"; identity: WebchatIdentifyPayload }
  | { type: "context"; context: WebchatContextPatch }
  | { type: "track"; events: WebchatTrackEvent[] }
  | { type: "flush" };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function isScalar(v: unknown): v is WebchatScalar | null {
  return (
    v === null ||
    typeof v === "string" ||
    typeof v === "boolean" ||
    (typeof v === "number" && Number.isFinite(v))
  );
}

/** Objeto raso só com valores simples; o resto é ignorado. */
function flatScalars(v: unknown, max: number): Record<string, WebchatScalar | null> | null {
  if (!isPlainObject(v)) return null;
  const out: Record<string, WebchatScalar | null> = {};
  let n = 0;
  for (const [k, value] of Object.entries(v)) {
    if (++n > max) break;
    if (isScalar(value)) out[k.slice(0, 64)] = value;
  }
  return out;
}

function sizeOf(v: unknown): number {
  try {
    return JSON.stringify(v).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function optionalText(v: unknown, max: number): string | undefined {
  return typeof v === "string" && v ? v.slice(0, max) : undefined;
}

/** Valida forma/tamanho de uma mensagem v2 do loader (sem `ns`/origem). */
export function parseBridgeMessage(data: unknown): BridgeMessage | null {
  if (!isWebchatMessage(data)) return null;
  if (sizeOf(data) > MAX_BRIDGE_MESSAGE_BYTES) return null;
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case "identify": {
      const id = msg.identity;
      if (!isPlainObject(id) || sizeOf(id) > MAX_IDENTIFY_BYTES) return null;
      if (typeof id.externalId !== "string" || !id.externalId) return null;
      const identity: WebchatIdentifyPayload = {
        externalId: id.externalId.slice(0, 128),
        userHash: typeof id.userHash === "string" ? id.userHash : "",
      };
      const name = optionalText(id.name, 254);
      const email = optionalText(id.email, 254);
      const phone = optionalText(id.phone, 254);
      if (name) identity.name = name;
      if (email) identity.email = email;
      if (phone) identity.phone = phone;
      const attributes = flatScalars(id.attributes, 50);
      if (attributes) identity.attributes = attributes;
      return { type: "identify", identity };
    }
    case "context": {
      const context = flatScalars(msg.context, 200);
      return context ? { type: "context", context } : null;
    }
    case "track": {
      if (!Array.isArray(msg.events)) return null;
      const events: WebchatTrackEvent[] = [];
      for (const raw of msg.events.slice(0, MAX_EVENTS_PER_MESSAGE)) {
        if (!isPlainObject(raw) || typeof raw.name !== "string" || !raw.name) continue;
        const ev: WebchatTrackEvent = { name: raw.name.slice(0, 64) };
        const d = flatScalars(raw.data, 10);
        if (d && Object.keys(d).length > 0) ev.data = d;
        if (raw.important === true) ev.important = true;
        if (typeof raw.at === "number" && Number.isFinite(raw.at)) ev.at = raw.at;
        else if (typeof raw.at === "string" && raw.at) ev.at = raw.at.slice(0, 40);
        events.push(ev);
      }
      return events.length ? { type: "track", events } : null;
    }
    case "flush":
      return { type: "flush" };
    default:
      return null;
  }
}

/** `open` do loader: v1 (sem campos) ou v2 (`message` prefill + `ref`). */
export function parseOpenMessage(data: unknown): WebchatOpenOptions | null {
  if (!isWebchatMessage(data) || data.type !== "open") return null;
  const msg = data as Record<string, unknown>;
  const out: WebchatOpenOptions = {};
  const message = optionalText(msg.message, MAX_MESSAGE_CHARS);
  if (message) out.message = message;
  if (typeof msg.ref === "string" && msg.ref && msg.ref.length <= MAX_REF_CHARS) out.ref = msg.ref;
  return out;
}

export type LoaderBridge = {
  /** Entrega o que já chegou (em ordem) e o que chegar depois. */
  subscribe: (handler: (msg: BridgeMessage) => void) => () => void;
  dispose: () => void;
};

/**
 * Escuta as mensagens v2 do loader desde já (antes do handshake) e guarda
 * até haver assinante. Só aceita do `window.parent` com origem `host`.
 */
export function createLoaderBridge(host: string, win: Window = window): LoaderBridge {
  const buffer: BridgeMessage[] = [];
  let handler: ((msg: BridgeMessage) => void) | null = null;
  const onMessage = (e: MessageEvent) => {
    if (e.source !== win.parent || e.origin !== host) return;
    const msg = parseBridgeMessage(e.data);
    if (!msg) return;
    if (handler) handler(msg);
    else if (buffer.length < 500) buffer.push(msg);
  };
  win.addEventListener("message", onMessage);
  return {
    subscribe(h) {
      handler = h;
      while (buffer.length) h(buffer.shift()!);
      return () => {
        if (handler === h) handler = null;
      };
    },
    dispose() {
      handler = null;
      buffer.length = 0;
      win.removeEventListener("message", onMessage);
    },
  };
}

function postV2(msg: FrameToLoaderV2, targetOrigin: string, win: Window = window): void {
  if (win.parent === win) return;
  try {
    win.parent.postMessage(msg, targetOrigin);
  } catch {
    /* origem inválida: ignora */
  }
}

/** Resultado do `identify` para o loader (que repassa ao site). */
export function postIdentityToParent(host: string, verified: boolean): void {
  postV2({ ns: WEBCHAT_NS, type: "identity", verified }, host);
}

/**
 * Handshake v2: igual ao v1 (`hello` só para `host`, espera `ack` de
 * `window.parent` com `event.origin === host`), anunciando `protocol: 2`.
 */
export function handshakeWithParentV2(host: string, timeoutMs = 6000): Promise<PageInfo | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || window.parent === window) {
      resolve(null);
      return;
    }
    let done = false;
    const finish = (v: PageInfo | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(retry);
      window.clearTimeout(timer);
      resolve(v);
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.origin !== host) return;
      if (!isWebchatMessage(e.data) || e.data.type !== "ack") return;
      const page = (e.data as { page?: PageInfo }).page;
      finish(page && typeof page === "object" ? page : {});
    };
    window.addEventListener("message", onMessage);
    const hello = () => postV2({ ns: WEBCHAT_NS, type: "hello", protocol: WEBCHAT_FRAME_PROTOCOL }, host);
    hello();
    // O loader pode ainda não ter registrado o listener (script async).
    const retry = window.setInterval(hello, 500);
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}
