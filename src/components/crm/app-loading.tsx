"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { BWIPO_MARK_LOADER_SRC } from "@/components/bwipo/bwipo-logo";
import { cn } from "@/lib/utils";

/**
 * Estado de carregamento ÚNICO do app.
 *
 * Composição da arte de loader: marca 3D estática em cima + anel-cometa
 * embaixo (trilha + ponta branca/magenta). Só o cometa gira, sempre
 * horário. O loader não imita o layout de destino.
 *
 * Segurança: nunca fica girando pra sempre. Passado `timeoutMs` sem o
 * conteúdo assumir, troca para um estado de erro explícito com ação de
 * recarregar.
 */

/** Alinhado ao `STUCK_TIMEOUT_MS` usado nos gates de tela do Flow. */
const DEFAULT_TIMEOUT_MS = 12_000;

export type AppLoadingTone = "solid" | "watermark";

export type AppLoadingProps = {
  /** Só para leitores de tela — nada visível ao lado da marca. */
  label?: string;
  /**
   * `inline` (padrão): bloco no fluxo, marca 32px no centro do container.
   * `screen` / `panel`: overlay fixo no viewport. `panel` é alias de `screen`.
   */
  variant?: "screen" | "panel" | "inline";
  /**
   * `watermark`: marca grande e translúcida (inbox/deal). Sem anel
   * colorido — menos enjoo ao trocar de card.
   */
  tone?: AppLoadingTone;
  /**
   * Marca ~44–56px + anel embaixo. `default` e `sm` só mudam o B.
   */
  size?: "default" | "sm";
  /** 0 desliga a rede de segurança (use só onde há outro guard de timeout). */
  timeoutMs?: number;
  /**
   * Estado terminal explícito (query falhou, nada a esperar): mostra a
   * mensagem + ação em vez do anel, sem esperar o timeout.
   */
  error?: string | null;
  /** Ação do estado de erro. Sem isto, recarrega a página. */
  onRetry?: () => void;
  className?: string;
};

function BrandMark({
  spinning,
  size = "default",
  tone = "solid",
}: {
  spinning: boolean;
  size?: "default" | "sm";
  tone?: AppLoadingTone;
}) {
  const watermark = tone === "watermark";
  const markPx = watermark ? 52 : size === "default" ? 56 : 44;

  return (
    <span
      className={cn(
        "brand-loader inline-flex flex-col items-center",
        watermark && "app-loading-watermark",
      )}
    >
      <img
        src={BWIPO_MARK_LOADER_SRC}
        alt=""
        width={markPx}
        height={markPx}
        draggable={false}
        decoding="async"
        className="brand-loader-mark relative shrink-0"
        style={{
          width: markPx,
          height: markPx,
          maxWidth: markPx,
          maxHeight: markPx,
        }}
      />
      {!watermark ? (
        <span
          aria-hidden
          className={cn(
            "brand-loader-orbit pointer-events-none",
            spinning && "is-spinning",
          )}
        >
          <span className="brand-loader-track" />
          <span className="brand-loader-comet" />
        </span>
      ) : null}
    </span>
  );
}

function Body({
  label,
  message,
  onRetry,
  size = "default",
  tone = "solid",
}: {
  label: string;
  message: string | null;
  onRetry?: () => void;
  size?: "default" | "sm";
  tone?: AppLoadingTone;
}) {
  if (message) {
    return (
      <div
        className="flex flex-col items-center gap-3 text-center"
        role="alert"
        data-app-loading-state="error"
      >
        <BrandMark spinning={false} size={size} />
        <p className="max-w-[260px] text-[13px] font-medium text-muted-foreground">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry ?? (() => window.location.reload())}
          className="rounded-full bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {onRetry ? "Tentar novamente" : "Recarregar"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center"
      role="status"
      aria-live="polite"
      aria-label={label}
      data-app-loading-state="loading"
    >
      <BrandMark spinning size={size} tone={tone} />
    </div>
  );
}

export function AppLoading({
  label = "Carregando",
  variant = "inline",
  tone = "solid",
  size,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  error = null,
  onRetry,
  className,
}: AppLoadingProps) {
  const [timedOut, setTimedOut] = React.useState(false);
  const resolvedSize = size ?? "sm";
  const resolvedTone = error || timedOut ? "solid" : tone;

  React.useEffect(() => {
    if (error || timeoutMs <= 0) return;
    const id = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [error, timeoutMs]);

  const message =
    error ?? (timedOut ? "Não foi possível carregar esta tela." : null);
  const busy = !message;

  const body = (
    <Body
      label={label}
      message={message}
      onRetry={onRetry}
      size={resolvedSize}
      tone={resolvedTone}
    />
  );

  if (variant === "inline") {
    return (
      <div
        className={cn(
          "flex min-h-[200px] w-full flex-1 flex-col items-center justify-center p-6",
          className,
        )}
        aria-busy={busy}
      >
        {body}
      </div>
    );
  }

  return (
    <ScreenOverlay className={className} busy={busy}>
      {body}
    </ScreenOverlay>
  );
}

const SCREEN_LOADER_ATTR = "data-app-loading-screen";

/**
 * Overlay no `document.body` (fora do `.v2-root { zoom }` e do grid).
 * Se dois overlays existirem, só o primeiro no DOM fica visível.
 */
function ScreenOverlay({
  children,
  className,
  busy,
}: {
  children: React.ReactNode;
  className?: string;
  busy: boolean;
}) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  const [isPrimary, setIsPrimary] = React.useState(true);

  React.useLayoutEffect(() => {
    setTarget(document.body);
  }, []);

  React.useLayoutEffect(() => {
    if (!target) return;
    const el = hostRef.current;
    if (!el) return;

    const sync = () => {
      const nodes = document.querySelectorAll(`[${SCREEN_LOADER_ATTR}]`);
      setIsPrimary(nodes[0] === el);
    };
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(target, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [target]);

  const node = (
    <div
      ref={hostRef}
      data-app-loading-screen=""
      className={cn(
        "fixed inset-0 z-[35] flex items-center justify-center bg-background",
        !isPrimary && "hidden",
        className,
      )}
      aria-busy={busy}
      aria-hidden={!isPrimary}
    >
      {children}
    </div>
  );

  // Só porta depois do mount. Pintar no fluxo no SSR e mover pro
  // `body` no hydrate quebrava o primeiro load (error.tsx; retry
  // remonta só no cliente e funcionava).
  if (!target) return null;
  return createPortal(node, target);
}
