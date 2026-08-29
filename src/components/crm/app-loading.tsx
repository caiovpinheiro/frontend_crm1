"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { BWIPO_MARK_SRC } from "@/components/bwipo/bwipo-logo";
import { cn } from "@/lib/utils";

/**
 * Estado de carregamento ÚNICO do app.
 *
 * Mesma marca do NavRail (`BWIPO_MARK_SRC`) + arco circular. Só o anel
 * gira (sempre horário — inverter depois do hydrate deslocava o primeiro
 * paint). O loader não imita o layout de destino.
 *
 * Segurança: nunca fica girando pra sempre. Passado `timeoutMs` sem o
 * conteúdo assumir, troca para um estado de erro explícito com ação de
 * recarregar.
 */

/** Alinhado ao `STUCK_TIMEOUT_MS` usado nos gates de tela do Flow. */
const DEFAULT_TIMEOUT_MS = 12_000;

export type AppLoadingProps = {
  /** Só para leitores de tela — nada visível ao lado da marca. */
  label?: string;
  /**
   * `screen` / `panel`: overlay fixo no viewport (marca no centro).
   * `panel` é alias de `screen` — um loader na coluna do conteúdo
   * (ao lado do rail) é o que fazia a marca pular no primeiro paint.
   * `inline`: bloco no fluxo, só para refetch com chrome já visível.
   */
  variant?: "screen" | "panel" | "inline";
  /**
   * `default` — splash (caixa 88 / marca 52).
   * `sm` — painel de conversa / inline (~54 / 32).
   * Inline omite e cai em `sm`.
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

const MARK_SIZE = {
  default: { box: 88, img: 52 },
  sm: { box: 54, img: 32 },
} as const;

function BrandMark({
  spinning,
  size = "default",
}: {
  spinning: boolean;
  size?: "default" | "sm";
}) {
  const reactId = React.useId().replace(/:/g, "");
  const gradId = `brand-loader-ring-${reactId}`;
  const { box: boxPx, img: imgPx } = MARK_SIZE[size];

  return (
    <span
      className="relative inline-flex items-center justify-center"
      style={{ width: boxPx, height: boxPx }}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0",
          spinning && "brand-loader-ring",
        )}
        data-dir="cw"
      >
        <svg viewBox="0 0 80 80" className="size-full">
          <defs>
            {/* Cyan → royal → magenta da marca; gira com o SVG. */}
            <linearGradient
              id={gradId}
              x1="40"
              y1="4"
              x2="40"
              y2="76"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor="var(--color-sky)" />
              <stop offset="45%" stopColor="var(--brand-primary)" />
              <stop offset="100%" stopColor="#d946ef" />
            </linearGradient>
          </defs>
          {/* ~270° de arco (circunferência 2π·36 ≈ 226). */}
          <circle
            cx="40"
            cy="40"
            r="36"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="4.75"
            strokeLinecap="round"
            strokeDasharray="170 56"
          />
        </svg>
      </span>
      {/* A marca não gira — só o anel. Caixa reservada = tamanho final. */}
      <img
        src={BWIPO_MARK_SRC}
        alt=""
        width={imgPx}
        height={imgPx}
        draggable={false}
        className="relative object-contain"
        style={{ width: imgPx, height: imgPx }}
      />
    </span>
  );
}

function Body({
  label,
  message,
  onRetry,
  size = "default",
}: {
  label: string;
  message: string | null;
  onRetry?: () => void;
  size?: "default" | "sm";
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
      <BrandMark spinning size={size} />
    </div>
  );
}

export function AppLoading({
  label = "Carregando",
  variant = "screen",
  size,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  error = null,
  onRetry,
  className,
}: AppLoadingProps) {
  const [timedOut, setTimedOut] = React.useState(false);
  const resolvedSize = size ?? (variant === "inline" ? "sm" : "default");

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
      onRetry={error ? onRetry : undefined}
      size={resolvedSize}
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
 * Overlay no `document.body` (fora do `.v2-root { zoom }` e do grid da
 * página). Sem isso, `fixed` dentro de `.v2-screen` centra no miolo —
 * e o `(app)/loading.tsx` centra na viewport: dois "b" ao mesmo tempo.
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
