"use client";

import { IconBell as Bell, IconMessage as MessageSquare, IconSparkles as Sparkles, IconBolt as Zap } from "@tabler/icons-react";
import * as React from "react";

import { TourCard } from "@/components/onboarding/tour-card";

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
 * Tour de onboarding leve — 4 passos overlay com o card Gradiente Vibrante.
 * Responsivo (sheet bottom em mobile, dialog centralizado em desktop).
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

  const back = () => {
    setStep((s) => Math.max(0, s - 1));
  };

  if (!open) return null;
  const current = STEPS[step];
  if (!current) return null;
  const Icon = current.icon;

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
        className="animate-in fade-in slide-in-from-bottom-6 duration-300"
      >
        <TourCard
          title={current.title}
          description={current.body}
          current={step + 1}
          total={STEPS.length}
          onNext={next}
          onBack={back}
          onClose={dismiss}
          nextLabel={current.cta ?? "Próximo"}
          icon={<Icon className="size-5 text-brand-foreground" strokeWidth={2.2} />}
        />
      </div>
    </div>
  );
}
