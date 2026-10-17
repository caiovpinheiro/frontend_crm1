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
