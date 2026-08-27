"use client";

import { IconArrowRight as ArrowRight, IconBell as Bell, IconMessage as MessageSquare, IconSparkles as Sparkles, IconBolt as Zap } from "@tabler/icons-react";
import * as React from "react";

import { cn } from "@/lib/utils";

type Step = {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  body: string;
  cta?: string;
};

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Bem-vindo ao Bwipo",
    body: "Tour rápido de 30 segundos pra mostrar 4 atalhos que economizam horas por dia.",
    cta: "Vamos lá",
  },
  {
    icon: MessageSquare,
    title: "Respostas rápidas com /",
    body: "Dentro do chat, digite \"/\" pra abrir suas respostas prontas. Tab seleciona, Enter envia. Adicione novas em Configurações → Respostas rápidas.",
    cta: "Próximo",
  },
  {
    icon: Bell,
    title: "Lembretes de 1 toque",
    body: "Botão de sino no header de cada conversa cria um lembrete (1h, amanhã, segunda…). Aparece em Tarefas e na timeline do contato.",
    cta: "Próximo",
  },
  {
    icon: Zap,
    title: "Painel do dia",
    body: "Os chips no topo do Inbox mostram o que precisa de você agora: pendentes, críticas (>1h) e quantas mensagens já enviou hoje.",
    cta: "Começar",
  },
];

export interface OnboardingTourProps {
  /**
   * Quando true, abre o tour. Quando undefined, o componente opera no modo
   * "fechado por padrão" — nunca abre sozinho. Use junto com `onOpenChange`
   * para controle externo (ex.: botão "Ajuda" futuro).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

/**
 * Tour de onboarding leve — 4 passos overlay com ícone, título, corpo, dots
 * e CTA. Responsivo (sheet bottom em mobile, dialog centralizado em desktop).
 *
 * IMPORTANTE: não abre mais automaticamente. Para exibir, controle via prop
 * `open` (ex.: a partir de um botão "Ajuda"). A persistência por localStorage
 * foi removida pelo mesmo motivo — o pai decide quando reabrir.
 */
export function OnboardingTour({ open: openProp, onOpenChange }: OnboardingTourProps = {}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : internalOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setInternalOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const dismiss = React.useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  const next = () => {
    if (step >= STEPS.length - 1) {
      dismiss();
    } else {
      setStep((s) => s + 1);
    }
  };

  if (!open) return null;
  const current = STEPS[step];
  if (!current) return null;
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-(--z-above) flex items-end justify-center bg-black/40 px-3 pb-3 backdrop-blur-sm md:items-center md:p-6"
      role="presentation"
      onClick={dismiss}
      onKeyDown={(e) => {
        if (e.key === "Escape") dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={current.title}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "relative w-full max-w-md overflow-hidden rounded-3xl bg-[var(--color-bg-card)] shadow-[var(--shadow-lg)] ring-1 ring-[var(--color-border)] dark:bg-[var(--glass-bg-modal)] dark:ring-slate-800",
          "animate-in fade-in slide-in-from-bottom-6 duration-300",
        )}
      >
        <div className="bg-linear-to-br from-[var(--color-primary-soft)] via-transparent to-[var(--color-lavender-muted)] p-6 pb-4 text-center">
          <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 dark:bg-primary/20">
            <Icon className="size-7" strokeWidth={2.2} />
          </div>
          <h2 className="font-display text-[20px] font-extrabold tracking-tight text-[var(--text-primary)] dark:text-slate-50">
            {current.title}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-ink-soft)] dark:text-[var(--text-faint)]">
            {current.body}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--glass-border-subtle)] bg-[var(--color-bg-subtle)]/50 px-5 py-4 dark:border-[var(--glass-border)] dark:bg-[var(--glass-bg-modal)]/40">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === step
                    ? "w-6 bg-primary"
                    : i < step
                      ? "w-1.5 bg-primary/50"
                      : "w-1.5 bg-[var(--glass-border-subtle)] dark:bg-slate-700",
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isLast && (
              <button
                type="button"
                onClick={dismiss}
                className="text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:text-foreground dark:text-[var(--color-ink-muted)] dark:hover:text-[var(--color-text-muted)]"
              >
                Pular
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-bold text-white shadow-[var(--shadow-indigo-glow)] transition-colors hover:bg-primary/90 active:scale-95"
            >
              {current.cta ?? "Próximo"}
              <ArrowRight className="size-3.5" strokeWidth={2.6} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
