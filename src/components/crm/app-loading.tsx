"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Estado de carregamento ÚNICO do app.
 *
 * Substitui os skeletons que imitavam o layout final (cards fantasma, ribbons
 * falsos, badges "0", "…"): eles causavam jank ao dar lugar ao conteúdo real.
 * Aqui só existe a marca + faixa de progresso, centralizadas — nada muda de
 * posição quando a UI real monta, porque o loader não desenha a UI real.
 *
 * Segurança: nunca fica girando pra sempre. Passado `timeoutMs` sem o
 * conteúdo assumir, troca para um estado de erro explícito com ação de
 * recarregar.
 */

/** Alinhado ao `STUCK_TIMEOUT_MS` usado nos gates de tela do Flow. */
const DEFAULT_TIMEOUT_MS = 12_000;

export type AppLoadingProps = {
  /** Texto acessível/visível abaixo da marca. */
  label?: string;
  /**
   * `screen`: ocupa a tela inteira reservando a coluna da NavRail (rotas).
   * `panel`: ocupa só a área disponível (dentro de layouts que já têm chrome).
   * `inline`: bloco centrado sem altura mínima de tela.
   */
  variant?: "screen" | "panel" | "inline";
  /** 0 desliga a rede de segurança (use só onde há outro guard de timeout). */
  timeoutMs?: number;
  /**
   * Estado terminal explícito (query falhou, nada a esperar): mostra a
   * mensagem + ação em vez da faixa de progresso, sem esperar o timeout.
   */
  error?: string | null;
  /** Ação do estado de erro. Sem isto, recarrega a página. */
  onRetry?: () => void;
  className?: string;
};

function BrandMark() {
  return (
    <span className="relative inline-flex size-16 items-center justify-center">
      <span
        aria-hidden
        className="app-loading-halo absolute inset-[-10px] rounded-[var(--radius-2xl)]"
        style={{
          background:
            "radial-gradient(circle, color-mix(in srgb, var(--brand-primary) 30%, transparent) 0%, transparent 70%)",
        }}
      />
      <span
        aria-hidden
        className="app-loading-mark relative flex size-16 items-center justify-center"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-bwipo-mark.png" alt="" className="size-16 object-contain" />
      </span>
    </span>
  );
}

function ProgressTrack() {
  return (
    <span
      aria-hidden
      className="relative block h-[3px] w-32 overflow-hidden rounded-full"
      style={{
        background: "color-mix(in srgb, var(--brand-primary) 14%, transparent)",
      }}
    >
      <span
        className="app-loading-track absolute inset-y-0 left-0 w-1/3 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--brand-primary) 50%, transparent 100%)",
        }}
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
        <BrandMark />
        <p className="max-w-[260px] text-[13px] font-medium text-[var(--text-secondary)]">
          {message}
        </p>
        <button
          type="button"
          onClick={onRetry ?? (() => window.location.reload())}
          className="rounded-full px-4 py-1.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--brand-primary)" }}
        >
          {onRetry ? "Tentar novamente" : "Recarregar"}
        </button>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center gap-4"
      role="status"
      aria-live="polite"
      data-app-loading-state="loading"
    >
      <BrandMark />
      <ProgressTrack />
      <p className="text-[12px] font-medium tracking-wide text-[var(--text-muted)]">
        {label}
      </p>
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
      className={cn("v2-screen grid min-w-0 overflow-hidden p-3 sm:p-4", className)}
      style={{ gridTemplateColumns: "var(--nav-rail-w, 72px) minmax(0, 1fr)" }}
      aria-busy={busy}
    >
      {/* Reserva a coluna da NavRail (o trilho real é fixed no layout). */}
      <div aria-hidden className="max-md:hidden" />
      <div className="flex min-h-0 min-w-0 flex-col">{content}</div>
    </div>
  );
}
