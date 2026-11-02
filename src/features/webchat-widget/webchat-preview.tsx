"use client";

/**
 * Prévia do widget: o mesmo `WebchatPanel` sobre um "site" cinza, sem API.
 * Serve ao iframe do painel (`?preview=1`) e ao wizard (`inline`). Com um
 * modelo configurado a conversa começa vazia e o que o analista clica aparece
 * como mensagem do visitante, para ver o fluxo como ele é.
 */
import { useEffect, useState } from "react";

import type { SiteContext, WebchatAppearance } from "./appearance";
import type { PreviewView } from "./protocol";
import type { WebchatPublicConfig } from "./types";
import type { UiMessage } from "./use-webchat-chat";
import { ChatIcon, WebchatPanel, themeStyle, webchatStyles as styles } from "./webchat-panel";

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

/** Sem o site, a faixa mostra de onde o valor virá. */
function sampleContext(appearance: WebchatAppearance | null): SiteContext {
  const out: SiteContext = {};
  const { titleKey, subtitleKey } = appearance?.contextBanner ?? {};
  if (titleKey) out[titleKey] = `Valor de ${titleKey}`;
  if (subtitleKey) out[subtitleKey] = `Valor de ${subtitleKey}`;
  return out;
}

export function WebchatPreview({
  config,
  view = "chat",
  inline = false,
}: {
  config: WebchatPublicConfig;
  view?: PreviewView;
  inline?: boolean;
}) {
  const appearance = config.appearance;
  const [sent, setSent] = useState<UiMessage[]>([]);
  const [resetKey, setResetKey] = useState(0);
  const modelKey = appearance?.model ?? "legacy";

  // Trocar de modelo recomeça a conversa de exemplo.
  useEffect(() => {
    setSent([]);
    setResetKey((k) => k + 1);
  }, [modelKey]);

  const previewConfig = { ...config, online: view !== "offline" };
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
      className={`${styles.root} ${styles.preview} ${inline ? styles.previewInline : ""}`}
      style={style}
      data-contrast={contrast}
      data-position={previewConfig.theme.position}
    >
      <WebchatPanel
        key={resetKey}
        config={previewConfig}
        variant="preview"
        view={panelView}
        messages={appearance ? sent : SAMPLE_MESSAGES}
        agentTyping={false}
        agentReadAt={null}
        siteContext={sampleContext(appearance)}
        canExpand
        onClose={() => {
          setSent([]);
          setResetKey((k) => k + 1);
        }}
        onSend={(text) => {
          if (!appearance) return;
          setSent((list) => [
            ...list,
            {
              id: `preview-${list.length}`,
              direction: "in",
              content: text,
              createdAt: new Date().toISOString(),
              status: "sent",
            },
          ]);
        }}
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
