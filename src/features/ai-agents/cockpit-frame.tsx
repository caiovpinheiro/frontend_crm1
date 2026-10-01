"use client";

import { logger, urlForLog } from "@/lib/logger";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  IconAlertTriangle,
  IconExternalLink,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

import {
  buildCockpitEmbedSrc,
  getCockpitOrigin,
  type CockpitNavGroup,
} from "./cockpit-api";

/** Mesmo limite do `SafePartnerIframe`: browsers não notificam `error` em
 *  iframe cross-origin recusado (X-Frame-Options / CSP frame-ancestors), então
 *  a ausência de `load` é o único sinal confiável. */
const IFRAME_LOAD_TIMEOUT_MS = 20_000;
/** Depois do `load`, tempo até considerarmos o handshake travado. Não bloqueia
 *  a view — o cockpit costuma explicar o motivo dentro do próprio iframe. */
const HANDSHAKE_TIMEOUT_MS = 8_000;
const INIT_RETRY_MS = 700;
const INIT_MAX_ATTEMPTS = 6;
const MIN_FRAME_HEIGHT = 420;
const MAX_FRAME_HEIGHT = 20_000;

interface CockpitFrameProps {
  cockpitUrl: string;
  apiBase: string;
  token: string;
  theme: "light" | "dark";
  /** Aba ativa; `null` enquanto o CRM ainda não escolheu uma. */
  stage: string | null;
  /** false quando o usuário está na aba "Agentes" — pausa o polling do cockpit. */
  visible: boolean;
  onNav: (nav: CockpitNavGroup[]) => void;
  onStageChange: (stage: string) => void;
  /** Chamado quando o cockpit reporta 401 — dispara renovação do token. */
  onAuthError: () => void;
}

type LoadPhase = "loading" | "loaded" | "timeout" | "error";

/**
 * Iframe do Cockpit IA com o handshake `postMessage` completo.
 *
 * Diferente do `SafePartnerIframe` (widgets de parceiro), o token NÃO vai na
 * URL e a renovação NÃO remonta o iframe: mandamos `cockpit:token` pelo canal
 * de mensagens. Remontar a cada 4 min recarregaria o painel e zeraria o
 * polling na cara do operador.
 */
export function CockpitFrame({
  cockpitUrl,
  apiBase,
  token,
  theme,
  stage,
  visible,
  onNav,
  onStageChange,
  onAuthError,
}: CockpitFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("loading");
  const [ready, setReady] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [height, setHeight] = useState(MIN_FRAME_HEIGHT);

  const src = useMemo(() => buildCockpitEmbedSrc(cockpitUrl), [cockpitUrl]);
  const cockpitOrigin = useMemo(() => getCockpitOrigin(cockpitUrl), [cockpitUrl]);

  const post = useCallback(
    (message: Record<string, unknown>) => {
      const target = iframeRef.current?.contentWindow;
      if (!target || !cockpitOrigin) return;
      target.postMessage(message, cockpitOrigin);
    },
    [cockpitOrigin],
  );

  // ── Recepção: só da origem do cockpit E da janela deste iframe ──────────
  useEffect(() => {
    if (!cockpitOrigin) return;
    function onMessage(event: MessageEvent) {
      if (event.origin !== cockpitOrigin) return;
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as { type?: unknown } | null;
      if (!data || typeof data !== "object") return;
      if (typeof data.type !== "string" || !data.type.startsWith("cockpit:")) return;

      const msg = data as Record<string, unknown>;
      switch (msg.type) {
        case "cockpit:ready": {
          setReady(true);
          setStalled(false);
          setRuntimeError(null);
          const nav = msg.nav;
          if (Array.isArray(nav)) onNav(nav as CockpitNavGroup[]);
          break;
        }
        case "cockpit:height": {
          const h = typeof msg.height === "number" ? msg.height : 0;
          if (h > 0) {
            setHeight(Math.min(MAX_FRAME_HEIGHT, Math.max(MIN_FRAME_HEIGHT, Math.ceil(h))));
          }
          break;
        }
        case "cockpit:stage-changed": {
          if (typeof msg.stage === "string") onStageChange(msg.stage);
          break;
        }
        case "cockpit:error": {
          const message =
            typeof msg.message === "string" && msg.message
              ? msg.message
              : "Falha ao carregar o cockpit.";
          setRuntimeError(message);
          if (msg.status === 401) onAuthError();
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [cockpitOrigin, onNav, onStageChange, onAuthError]);

  // ── Envio do init, com retry ────────────────────────────────────────────
  // O `load` do iframe já garante que os scripts rodaram, mas o retry cobre
  // recargas internas do cockpit sem custo perceptível.
  useEffect(() => {
    if (loadPhase !== "loaded" || ready) return;
    let attempts = 0;
    const send = () => {
      attempts += 1;
      post({
        type: "cockpit:init",
        token,
        apiBase,
        theme,
        stage: stage ?? undefined,
      });
      if (attempts >= INIT_MAX_ATTEMPTS) window.clearInterval(id);
    };
    send();
    const id = window.setInterval(send, INIT_RETRY_MS);
    return () => window.clearInterval(id);
  }, [loadPhase, ready, post, reloadKey, token, apiBase, theme, stage]);

  // ── Timeout de carga do iframe ──────────────────────────────────────────
  useEffect(() => {
    const startedAt = Date.now();
    const id = window.setTimeout(() => {
      setLoadPhase((prev) => {
        if (prev !== "loading") return prev;
        logger.warn("cockpit.iframe", "load_timeout", {
          cockpitUrl: urlForLog(cockpitUrl),
          waitedMs: Date.now() - startedAt,
        });
        return "timeout";
      });
    }, IFRAME_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [reloadKey, cockpitUrl]);

  // ── Handshake travado (carregou, mas não respondeu `cockpit:ready`) ─────
  useEffect(() => {
    if (loadPhase !== "loaded" || ready) return;
    const id = window.setTimeout(() => setStalled(true), HANDSHAKE_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, [loadPhase, ready, reloadKey]);

  // ── Atualizações pós-handshake ──────────────────────────────────────────
  useEffect(() => {
    if (ready) post({ type: "cockpit:theme", theme });
  }, [ready, theme, post]);

  useEffect(() => {
    if (ready && token) post({ type: "cockpit:token", token });
  }, [ready, token, post]);

  useEffect(() => {
    if (ready && stage) post({ type: "cockpit:stage", stage });
  }, [ready, stage, post]);

  useEffect(() => {
    if (ready) post({ type: "cockpit:visibility", visible });
  }, [ready, visible, post]);

  // O reset vive aqui (evento), não num efeito disparado por `reloadKey`:
  // `key={reloadKey}` já força a remontagem do iframe.
  const retry = useCallback(() => {
    setReloadKey((k) => k + 1);
    setLoadPhase("loading");
    setReady(false);
    setStalled(false);
    setRuntimeError(null);
  }, []);

  const openExternal = useCallback(() => {
    // URL standalone, sem token — o modo standalone tem autenticação própria.
    window.open(cockpitUrl, "_blank", "noopener,noreferrer");
  }, [cockpitUrl]);

  const blocking = loadPhase === "loading" || loadPhase === "timeout" || loadPhase === "error";
  const notice = runtimeError ?? (stalled ? "O cockpit carregou mas não respondeu ao CRM." : null);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      {notice && !blocking && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-2">
          <IconAlertTriangle className="size-4 shrink-0 text-[var(--color-danger-text)]" />
          <p className="min-w-0 flex-1 font-body text-[12.5px] text-[var(--text-secondary)]">
            {notice}
          </p>
          <Button size="sm" variant="ghost" onClick={retry}>
            <IconRefresh className="size-3.5" />
            Recarregar
          </Button>
        </div>
      )}

      <div
        className="relative min-w-0 overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)]"
        style={{ height: blocking ? MIN_FRAME_HEIGHT : height }}
      >
        {loadPhase === "loading" && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-[var(--glass-bg-subtle)] text-[var(--text-muted)]">
            <IconLoader2 className="size-6 animate-spin" />
            <p className="font-body text-[13px]">Carregando Cockpit IA…</p>
          </div>
        )}

        {(loadPhase === "timeout" || loadPhase === "error") && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-[var(--glass-bg-subtle)] p-8 text-center">
            <IconAlertTriangle className="size-7 text-[var(--color-danger-text)]" />
            <div>
              <p className="font-display text-[15px] font-semibold text-[var(--text-primary)]">
                {loadPhase === "timeout"
                  ? "O Cockpit IA demorou muito para responder"
                  : "Não foi possível carregar o Cockpit IA"}
              </p>
              <p className="mt-1 font-body text-[12.5px] text-[var(--text-muted)]">
                {loadPhase === "timeout"
                  ? "O serviço do cockpit pode estar fora do ar ou bloqueando ser embedado (CSP frame-ancestors)."
                  : "Verifique a conexão ou tente novamente em alguns instantes."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Button size="sm" variant="default" onClick={retry}>
                <IconRefresh className="size-3.5" />
                Tentar novamente
              </Button>
              <Button size="sm" variant="ghost" onClick={openExternal}>
                <IconExternalLink className="size-3.5" />
                Abrir em nova aba
              </Button>
            </div>
          </div>
        )}

        <iframe
          key={reloadKey}
          ref={iframeRef}
          src={src}
          title="Cockpit IA"
          // `allow-same-origin` é obrigatório: sem ele o iframe teria origem
          // opaca e o backend receberia `Origin: null`, quebrando o CORS.
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
          onLoad={() => setLoadPhase("loaded")}
          onError={() => setLoadPhase("error")}
          className="h-full w-full border-0"
        />
      </div>
    </div>
  );
}
