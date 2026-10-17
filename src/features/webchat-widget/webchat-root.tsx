"use client";

/**
 * Raiz da página `/webchat/[publicKey]`. Três modos:
 *
 *  - **embedded** (`?host=` e dentro de iframe): só renderiza depois de
 *    (1) `document.referrer` bater com `host`, (2) handshake `postMessage`
 *    com o loader confirmar a origem do pai e (3) `GET /config?host=`
 *    aprovar (`host ∈ allowedOrigins`). Qualquer falha → nada é exibido.
 *  - **hosted** (aberta direto, sem iframe): página hospedada full-screen.
 *  - **preview** (`?preview=1`, iframe do painel do CRM, mesma origem):
 *    conversa de exemplo, sem API de sessão; o CRM manda a config ainda
 *    não salva via `postMessage`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchWebchatConfig, type WebchatIdentity } from "./api";
import {
  WEBCHAT_NS,
  handshakeWithParent,
  isWebchatMessage,
  postToParent,
  type PageInfo,
  type PreviewConfigMessage,
  type PreviewView,
} from "./protocol";
import { normalizePublicConfig, type WebchatPublicConfig } from "./types";
import { useWebchatChat, type UiMessage } from "./use-webchat-chat";
import { ChatIcon, WebchatPanel, themeStyle, webchatStyles as styles } from "./webchat-panel";
import { logger } from "@/lib/logger";
import { isOriginAllowed, normalizeOrigin, referrerMatchesHost } from "@/lib/webchat-origin";

export type WebchatRootProps = {
  publicKey: string;
  host: string | null;
  preview: boolean;
};

type Gate = "checking" | "ok" | "refused" | "error";

export function WebchatRoot({ publicKey, host, preview }: WebchatRootProps) {
  if (preview) return <PreviewRoot publicKey={publicKey} />;
  return <LiveRoot publicKey={publicKey} host={host} />;
}

/**
 * Valida o embed. Exportado para teste: devolve a config aprovada ou o
 * motivo da recusa.
 */
export async function verifyEmbed(args: {
  publicKey: string;
  host: string;
  referrer: string;
  handshake: (host: string) => Promise<PageInfo | null>;
  loadConfig: (key: string, host: string) => Promise<WebchatPublicConfig>;
}): Promise<
  | { ok: true; config: WebchatPublicConfig; page: PageInfo }
  | { ok: false; reason: "bad_host" | "referrer" | "handshake" | "origin" | "config" }
> {
  const host = normalizeOrigin(args.host);
  if (!host) return { ok: false, reason: "bad_host" };
  if (!referrerMatchesHost(args.referrer, host)) return { ok: false, reason: "referrer" };
  const [page, config] = await Promise.all([
    args.handshake(host),
    args.loadConfig(args.publicKey, host).catch(() => null),
  ]);
  if (!config) return { ok: false, reason: "config" };
  if (!isOriginAllowed(host, config.allowedOrigins)) return { ok: false, reason: "origin" };
  if (!page) return { ok: false, reason: "handshake" };
  return { ok: true, config, page };
}

function LiveRoot({ publicKey, host: hostParam }: { publicKey: string; host: string | null }) {
  // Só no client (iframe vs. página direta) — evita divergência de hidratação.
  const [embedded, setEmbedded] = useState<boolean | null>(null);
  const host = embedded ? normalizeOrigin(hostParam) : null;
  const [gate, setGate] = useState<Gate>("checking");
  const [config, setConfig] = useState<WebchatPublicConfig | null>(null);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [offlineSent, setOfflineSent] = useState(false);

  useEffect(() => {
    const inFrame = window.parent !== window && Boolean(hostParam);
    setEmbedded(inFrame);
    setPanelOpen(!inFrame);
  }, [hostParam]);

  useEffect(() => {
    if (embedded === null) return;
    let cancelled = false;
    (async () => {
      if (embedded) {
        const res = await verifyEmbed({
          publicKey,
          host: hostParam ?? "",
          referrer: document.referrer,
          handshake: handshakeWithParent,
          loadConfig: fetchWebchatConfig,
        });
        if (cancelled) return;
        if (!res.ok) {
          logger.warn("webchat", "embed recusado", { reason: res.reason });
          setGate("refused");
          return;
        }
        setConfig(res.config);
        setPageInfo(res.page);
        setGate("ok");
        return;
      }
      try {
        const cfg = await fetchWebchatConfig(publicKey);
        if (cancelled) return;
        setConfig(cfg);
        setGate("ok");
      } catch {
        if (!cancelled) setGate("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [embedded, hostParam, publicKey]);

  // Loader → iframe: abrir/fechar.
  useEffect(() => {
    if (!embedded || !host) return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window.parent || e.origin !== host) return;
      if (!isWebchatMessage(e.data)) return;
      if (e.data.type === "open") setPanelOpen(true);
      if (e.data.type === "close") setPanelOpen(false);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [embedded, host]);

  const chat = useWebchatChat({
    publicKey,
    enabled: gate === "ok",
    panelVisible: panelOpen,
    host,
    pageInfo,
  });

  // Tema + não lidas para o loader (bolha/badge no site do cliente).
  const unread = chat.unreadCount;
  useEffect(() => {
    if (!embedded || !host || gate !== "ok" || !config) return;
    postToParent(
      {
        ns: WEBCHAT_NS,
        type: "ready",
        theme: {
          primary: config.theme.primary,
          position: config.theme.position,
          title: config.theme.title,
        },
        unread: 0,
      },
      host,
    );
  }, [embedded, host, gate, config]);

  useEffect(() => {
    if (!embedded || !host || gate !== "ok") return;
    postToParent({ ns: WEBCHAT_NS, type: "unread", count: panelOpen ? 0 : unread }, host);
  }, [embedded, host, gate, unread, panelOpen]);

  const close = useCallback(() => {
    setPanelOpen(false);
    if (host) postToParent({ ns: WEBCHAT_NS, type: "close" }, host);
  }, [host]);

  if (gate === "refused" || embedded === null) return null;

  const variant = embedded ? "embedded" : "hosted";
  const effectiveConfig = config ?? normalizePublicConfig({}, publicKey);
  const { style, contrast } = themeStyle(effectiveConfig);

  const session = chat.session;
  const hasHistory = chat.messages.length > 0;
  let view: "loading" | "unavailable" | "prechat" | "offline" | "chat";
  if (gate === "error") view = "unavailable";
  else if (gate === "checking" || !chat.historyLoaded) view = "loading";
  else if (!effectiveConfig.online && !hasHistory) view = "offline";
  else if (effectiveConfig.identification !== "none" && !session?.identified && !hasHistory)
    view = "prechat";
  else view = "chat";

  const identity: WebchatIdentity = {
    name: session?.name,
    email: session?.email,
    phone: session?.phone,
  };

  return (
    <div
      className={`${styles.root} ${embedded ? styles.embedded : styles.hosted}`}
      style={style}
      data-contrast={contrast}
    >
      <WebchatPanel
        config={effectiveConfig}
        variant={variant}
        view={view}
        messages={chat.messages}
        agentTyping={chat.agentTyping}
        agentReadAt={chat.agentReadAt}
        identity={identity}
        offlineSent={offlineSent}
        onClose={embedded ? close : undefined}
        onSend={chat.send}
        onRetry={chat.retry}
        onTyping={chat.notifyTyping}
        onIdentify={chat.identify}
        onOfflineSubmit={async (id, message) => {
          await chat.identify(id);
          const ok = await chat.send(message);
          if (!ok) throw new Error("send failed");
          setOfflineSent(true);
        }}
      />
    </div>
  );
}

const SAMPLE_MESSAGES: UiMessage[] = [
  {
    id: "p1",
    direction: "in",
    content: "Oi! Vocês atendem aos sábados?",
    createdAt: "2026-01-01T12:00:00.000Z",
    status: "read",
  },
  {
    id: "p2",
    direction: "out",
    content: "Olá! Atendemos sim, das 9h às 13h. Posso ajudar com mais alguma coisa?",
    createdAt: "2026-01-01T12:01:00.000Z",
    senderName: "Equipe",
  },
];

function PreviewRoot({ publicKey }: { publicKey: string }) {
  const [config, setConfig] = useState<WebchatPublicConfig>(() =>
    normalizePublicConfig({}, publicKey),
  );
  const [view, setView] = useState<PreviewView>("chat");

  useEffect(() => {
    let cancelled = false;
    let fromParent = false;
    // Config salva como ponto de partida; o CRM sobrescreve com a do formulário.
    fetchWebchatConfig(publicKey)
      .then((cfg) => {
        if (!cancelled && !fromParent) setConfig(cfg);
      })
      .catch(() => {});
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== window.parent) return;
      if (!isWebchatMessage(e.data) || e.data.type !== "preview-config") return;
      const msg = e.data as PreviewConfigMessage;
      fromParent = true;
      setConfig(normalizePublicConfig({ ...msg.config, online: true }, publicKey));
      if (msg.view) setView(msg.view);
    };
    window.addEventListener("message", onMessage);
    postToParent({ ns: WEBCHAT_NS, type: "hello" }, window.location.origin);
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, [publicKey]);

  const previewConfig = useMemo(
    () => ({ ...config, online: view !== "offline" }),
    [config, view],
  );
  const { style, contrast } = themeStyle(previewConfig);
  const panelView =
    view === "offline"
      ? "offline"
      : view === "prechat" && previewConfig.identification !== "none"
        ? "prechat"
        : "chat";
  const noop = async () => {};

  return (
    <div
      className={`${styles.root} ${styles.preview}`}
      style={style}
      data-contrast={contrast}
      data-position={previewConfig.theme.position}
    >
      <WebchatPanel
        config={previewConfig}
        variant="preview"
        view={panelView}
        messages={SAMPLE_MESSAGES}
        agentTyping={false}
        agentReadAt={null}
        onClose={() => {}}
        onSend={() => {}}
        onRetry={() => {}}
        onTyping={() => {}}
        onIdentify={noop}
        onOfflineSubmit={noop}
      />
      <span className={styles.previewBubble} aria-hidden="true">
        <ChatIcon />
      </span>
    </div>
  );
}
