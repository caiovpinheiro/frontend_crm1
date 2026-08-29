"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Estado de carregamento ÚNICO do app.
 *
 * Marca "b" estática + arco circular (estilo Hostinger). Só o anel gira;
 * a direção (horário / anti-horário) é sorteada uma vez por mount.
 * O loader não imita o layout de destino.
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
   * `screen`: overlay fixo no viewport (marca no centro geométrico).
   * `panel`: ocupa só a área disponível (dentro de layouts que já têm chrome).
   * `inline`: bloco centrado sem altura mínima de tela.
   */
  variant?: "screen" | "panel" | "inline";
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

function BrandMark({ spinning }: { spinning: boolean }) {
  const reactId = React.useId().replace(/:/g, "");
  const gradId = `brand-loader-ring-${reactId}`;
  const clockwiseRef = React.useRef(Math.random() < 0.5);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const dir = mounted && !clockwiseRef.current ? "ccw" : "cw";
  const animate = spinning;

  return (
    <span className="relative inline-flex size-[5.5rem] items-center justify-center">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0",
          animate && "brand-loader-ring",
        )}
        data-dir={dir}
      >
        <svg viewBox="0 0 80 80" className="size-full">
          <defs>
            {/* Cyan → royal → magenta da fita 3D; gira com o SVG. */}
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
      {/* A marca não gira — só o anel. */}
      <img
        src="/brand/bwipo-mark.png"
        alt=""
        width={112}
        height={112}
        draggable={false}
        className="relative size-[3.25rem] object-contain"
      />
    </span>
  );
}

function Body({
  label,
  message,
  onRetry,
}: {
  label: string;
  message: string | null;
  onRetry?: () => void;
}) {
  if (message) {
    return (
      <div
        className="flex flex-col items-center gap-3 text-center"
        role="alert"
        data-app-loading-state="error"
      >
        <BrandMark spinning={false} />
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
      <BrandMark spinning />
    </div>
  );
}

export function AppLoading({
  label = "Carregando",
  variant = "screen",
  timeoutMs = DEFAULT_TIMEOUT_MS,
  error = null,
  onRetry,
  className,
}: AppLoadingProps) {
  const [timedOut, setTimedOut] = React.useState(false);

  React.useEffect(() => {
    if (error || timeoutMs <= 0) return;
    const id = window.setTimeout(() => setTimedOut(true), timeoutMs);
    return () => window.clearTimeout(id);
  }, [error, timeoutMs]);

  const message =
    error ?? (timedOut ? "Não foi possível carregar esta tela." : null);
  const busy = !message;

  const content = (
    <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-6">
      <Body label={label} message={message} onRetry={error ? onRetry : undefined} />
    </div>
  );

  if (variant === "inline") {
    return (
      <div className={cn("flex min-h-[200px] w-full", className)} aria-busy={busy}>
        {content}
      </div>
    );
  }

  if (variant === "panel") {
    return (
      <div
        className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}
        aria-busy={busy}
      >
        {content}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[35] flex items-center justify-center bg-background",
        className,
      )}
      aria-busy={busy}
    >
      <Body label={label} message={message} onRetry={error ? onRetry : undefined} />
    </div>
  );
}
