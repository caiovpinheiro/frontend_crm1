/**
 * Protocolo `postMessage` entre o loader (`public/webchat/embed.js`, no site
 * do cliente) e o iframe (`/webchat/{publicKey}`). Mantenha em sincronia com
 * o loader — ele é JS puro e não importa este arquivo.
 *
 *  iframe → loader: `hello` (handshake) · `ready` (tema) · `unread` · `close`
 *  loader → iframe: `ack` (confirma origem + dados da página) · `open` · `close`
 *  CRM → iframe (preview, mesma origem): `preview-config`
 *
 * Toda mensagem carrega `ns: "bwipo:webchat"`; o receptor sempre confere
 * `event.source` e `event.origin` antes de agir.
 *
 * v2 (identify, context, track, flush, open com prefill/ref): tipos abaixo,
 * contrato em `backend_crm1/docs/decisoes/webchat-widget.md` §9.
 */
import type { WebchatPublicConfig } from "./types";

export const WEBCHAT_NS = "bwipo:webchat";

export type PageInfo = { page?: string; referrer?: string; title?: string };

export type LoaderToFrame =
  | { ns: typeof WEBCHAT_NS; type: "ack"; page?: PageInfo }
  | { ns: typeof WEBCHAT_NS; type: "open" }
  | { ns: typeof WEBCHAT_NS; type: "close" };

export type FrameToLoader =
  | { ns: typeof WEBCHAT_NS; type: "hello" }
  | {
      ns: typeof WEBCHAT_NS;
      type: "ready";
      theme: { primary: string; position: "right" | "left"; title: string };
      unread: number;
    }
  | { ns: typeof WEBCHAT_NS; type: "unread"; count: number }
  | { ns: typeof WEBCHAT_NS; type: "close" };

// ── Webchat v2 (só tipos) ────────────────────────────────────────────────
// Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9 (fonte única).
// O loader (`embed.js`, JS puro) segue os mesmos formatos. As mensagens v2
// só circulam depois do handshake com `hello.protocol >= 2`; o v1 ignora o
// que não conhece.

/** Versão do protocolo anunciada no `hello` do iframe v2. */
export type WebchatProtocolVersion = 1 | 2;

/** Valor simples aceito em contexto, atributos e dados de evento. */
export type WebchatScalar = string | number | boolean;

/** `BwipoWebchat.capabilities` (loader v2). */
export type WebchatCapabilities = {
  prefill: boolean;
  identify: boolean;
  track: boolean;
  context: boolean;
};

/** `detail` do evento `window` `"bwipo:webchat:ready"`. */
export type WebchatReadyEventDetail = {
  version: 2;
  capabilities: WebchatCapabilities;
};

/** Nome do evento disparado no `window` do site quando o widget fica pronto. */
export type WebchatReadyEventName = "bwipo:webchat:ready";

/** `BwipoWebchat.identify(...)` / mensagem `identify`. */
export type WebchatIdentifyPayload = {
  externalId: string;
  /** hex(HMAC-SHA256(segredo de identidade do canal, externalId)). */
  userHash: string;
  name?: string;
  email?: string;
  phone?: string;
  /** Objeto raso; mapeado para campos personalizados pela config do canal. */
  attributes?: Record<string, WebchatScalar | null>;
};

/** `BwipoWebchat.open({ message, ref })`: prefill sem enviar + metadado. */
export type WebchatOpenOptions = {
  message?: string;
  ref?: string;
};

/** Um evento da linha do tempo (`track`). `at` em ms epoch (ou ISO na API). */
export type WebchatTrackEvent = {
  name: string;
  data?: Record<string, WebchatScalar | null>;
  important?: boolean;
  at?: number | string;
};

/** Patch do contexto vivo: merge raso; `null` remove a chave. */
export type WebchatContextPatch = Record<string, WebchatScalar | null>;

/** Item de `window.BwipoWebchatQueue` (chamadas antes do loader carregar). */
export type WebchatQueuedCall =
  | ["open", WebchatOpenOptions?]
  | ["close"]
  | ["toggle"]
  | ["identify", WebchatIdentifyPayload]
  | ["setContext", WebchatContextPatch]
  | ["track", string, Record<string, WebchatScalar | null>?, { important?: boolean; at?: Date | number | string }?];

/** API pública do loader v2 (`window.BwipoWebchat`). */
export type WebchatLoaderApiV2 = {
  version: 2;
  capabilities: WebchatCapabilities;
  open: (opts?: WebchatOpenOptions) => void;
  close: () => void;
  toggle: () => void;
  identify: (payload: WebchatIdentifyPayload) => void;
  setContext: (patch: WebchatContextPatch) => void;
  track: (
    name: string,
    data?: Record<string, WebchatScalar | null>,
    opts?: { important?: boolean; at?: Date | number | string },
  ) => void;
};

/** loader → iframe (v2). `open` v2 substitui o `open` v1 (campos opcionais). */
export type LoaderToFrameV2 =
  | ({ ns: typeof WEBCHAT_NS; type: "open" } & WebchatOpenOptions)
  | { ns: typeof WEBCHAT_NS; type: "identify"; identity: WebchatIdentifyPayload }
  | { ns: typeof WEBCHAT_NS; type: "context"; context: WebchatContextPatch }
  | { ns: typeof WEBCHAT_NS; type: "track"; events: WebchatTrackEvent[] }
  | { ns: typeof WEBCHAT_NS; type: "flush" };

/** iframe → loader (v2). */
export type FrameToLoaderV2 =
  | { ns: typeof WEBCHAT_NS; type: "hello"; protocol?: WebchatProtocolVersion }
  | { ns: typeof WEBCHAT_NS; type: "identity"; verified: boolean };

// ── Rotas públicas v2 (§9.3–§9.6) ───────────────────────────────────────

/** `POST /api/public/webchat/context` */
export type WebchatContextRequest = { context: WebchatContextPatch };
export type WebchatContextResponse = { ok: true; updatedAt: string; ignored: string[] };

/** `POST /api/public/webchat/events` (Bearer ou `token` no corpo p/ sendBeacon). */
export type WebchatEventsRequest = { events: WebchatTrackEvent[]; token?: string };
export type WebchatEventsResponse = {
  ok: true;
  accepted: number;
  ignored: { index: number; reason: string }[];
};

/** `POST /api/public/webchat/session/identify` — campos v2 (além dos da v1). */
export type WebchatIdentifyRequestV2 = Partial<WebchatIdentifyPayload>;
export type WebchatIdentifyVerification = {
  verified: boolean;
  reason?: "SIGNATURE_INVALID" | "SIGNATURE_MISSING" | "IDENTITY_NOT_CONFIGURED";
};

/** Códigos de erro novos das rotas v2 (`{ message, code }`). */
export type WebchatV2ErrorCode =
  | "TRACKING_DISABLED"
  | "TOO_MANY_EVENTS"
  | "IDENTITY_NOT_CONFIGURED"
  | "S2S_NOT_CONFIGURED"
  | "SIGNATURE_INVALID"
  | "TIMESTAMP_EXPIRED"
  | "IDEMPOTENCY_KEY_INVALID"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_IN_PROGRESS";

/** SSE do inbox (frente B). */
export type WebchatContextSseEvent = {
  type: "webchat_context";
  contactId: string;
  channelId: string;
  state: Record<string, WebchatScalar>;
  updatedAt: string;
};
export type WebchatTimelineSseEvent = {
  type: "webchat_event";
  contactId: string;
  channelId: string;
  event: {
    id: string;
    name: string;
    data: Record<string, WebchatScalar> | null;
    important: boolean;
    occurredAt: string;
  };
};

export type PreviewView = "chat" | "prechat" | "offline";

export type PreviewConfigMessage = {
  ns: typeof WEBCHAT_NS;
  type: "preview-config";
  config: Partial<WebchatPublicConfig>;
  view?: PreviewView;
};

export function isWebchatMessage(data: unknown): data is { ns: string; type: string } {
  return (
    !!data &&
    typeof data === "object" &&
    (data as { ns?: unknown }).ns === WEBCHAT_NS &&
    typeof (data as { type?: unknown }).type === "string"
  );
}

export function postToParent(msg: FrameToLoader, targetOrigin: string): void {
  if (typeof window === "undefined" || window.parent === window) return;
  try {
    window.parent.postMessage(msg, targetOrigin);
  } catch {
    /* origem inválida: ignora */
  }
}

/**
 * Handshake: o iframe manda `hello` só para `host` (o browser descarta se o
 * pai não for dessa origem) e espera `ack` vindo de `window.parent` com
 * `event.origin === host`. Resolve com os dados da página do pai.
 */
export function handshakeWithParent(host: string, timeoutMs = 6000): Promise<PageInfo | null> {
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
    const hello = () => postToParent({ ns: WEBCHAT_NS, type: "hello" }, host);
    hello();
    // O loader pode ainda não ter registrado o listener (script async).
    const retry = window.setInterval(hello, 500);
    const timer = window.setTimeout(() => finish(null), timeoutMs);
  });
}

/** UTMs/click ids da URL da página (para `POST /session`). */
export function utmFromUrl(href: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!href) return out;
  try {
    const u = new URL(href);
    for (const k of [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
    ]) {
      const v = u.searchParams.get(k);
      if (v) out[k] = v.slice(0, 200);
    }
  } catch {
    /* ignore */
  }
  return out;
}
