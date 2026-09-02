"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { IconBolt, IconCheck, IconSparkles } from "@tabler/icons-react";

import { InputGlass } from "@/components/crm/input-glass";
import { SwitchGlass } from "@/components/crm/switch-glass";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  AUTOMATION_TRIGGER_TYPES,
  triggerTypeLabel,
} from "@/lib/automation-workflow";
import {
  consumeQueuedPageTour,
  PageTourButton,
  peekQueuedPageTour,
  registerCreateWizardBridge,
  startPageTour,
  stopPageTour,
} from "@/features/product-tour";

import { useCreateAutomation } from "./hooks";

const STEPS = [
  { id: 1, label: "Identificação" },
  { id: 2, label: "Gatilho" },
  { id: 3, label: "Opções" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

type NewAutomationModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function NewAutomationModal({
  open,
  onOpenChange,
}: NewAutomationModalProps) {
  const router = useRouter();
  const createMutation = useCreateAutomation();
  const [step, setStep] = useState<StepId>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [triggerType, setTriggerType] = useState<string>(
    AUTOMATION_TRIGGER_TYPES[0],
  );
  const [allowManualRun, setAllowManualRun] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName("");
    setDescription("");
    setTriggerType(AUTOMATION_TRIGGER_TYPES[0]);
    setAllowManualRun(false);
  }, [open]);

  useEffect(() => {
    if (!open) {
      registerCreateWizardBridge(null);
      return;
    }
    registerCreateWizardBridge({ setStep: (n) => setStep(n) });
    const pending = peekQueuedPageTour();
    let timer: number | undefined;
    if (pending === "automations-create") {
      timer = window.setTimeout(() => {
        consumeQueuedPageTour();
        startPageTour("automations-create");
      }, 280);
    }
    return () => {
      registerCreateWizardBridge(null);
      if (timer) window.clearTimeout(timer);
      stopPageTour();
    };
  }, [open]);

  function closeModal() {
    consumeQueuedPageTour();
    stopPageTour();
    onOpenChange(false);
  }

  function goNext() {
    if (step === 1 && !name.trim()) {
      toast.error("Informe um nome para a automação");
      return;
    }
    if (step < 3) setStep((s) => (s + 1) as StepId);
  }

  async function handleCreate() {
    if (!name.trim()) {
      toast.error("Informe um nome para a automação");
      setStep(1);
      return;
    }
    try {
      const created = await createMutation.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        triggerType,
        triggerConfig: {},
        active: false,
        allowManualRun,
      });
      toast.success("Automação criada");
      onOpenChange(false);
      router.push(`/automations/${created.number ?? created.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao criar automação",
      );
    }
  }

  const stepMeta = STEPS[step - 1];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeModal();
        else onOpenChange(next);
      }}
    >
      <DialogContent
        size="lg"
        bodyClassName="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0"
        panelClassName="max-h-[min(88vh,720px)]"
      >
        <header className="shrink-0 border-b border-[var(--glass-border-subtle)] px-6 pb-4 pt-5">
          <div className="flex items-start gap-3 pr-20">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--brand-primary)]">
              <IconBolt size={18} />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-[16px]">Nova automação</DialogTitle>
              <DialogDescription className="mt-0.5 text-[12.5px]">
                Passo {step} de 3 · {stepMeta.label}
              </DialogDescription>
            </div>
          </div>
          <ol
            data-tour="create-stepper"
            className="mt-4 flex items-center gap-2"
          >
            {STEPS.map((s, i) => {
              const done = step > s.id;
              const active = step === s.id;
              return (
                <li key={s.id} className="flex min-w-0 flex-1 items-center gap-2">
                  {i > 0 ? (
                    <span
                      className={cn(
                        "h-px min-w-4 flex-1",
                        step > s.id - 1
                          ? "bg-[var(--brand-primary)]"
                          : "bg-[var(--glass-border)]",
                      )}
                    />
                  ) : null}
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold",
                      done || active
                        ? "bg-[var(--brand-primary)] text-white"
                        : "border border-[var(--glass-border)] text-[var(--text-muted)]",
                    )}
                  >
                    {done ? <IconCheck size={13} stroke={2.6} /> : s.id}
                  </span>
                  <span
                    className={cn(
                      "truncate font-display text-[12px] font-semibold",
                      active
                        ? "text-[var(--text-primary)]"
                        : "text-[var(--text-muted)]",
                    )}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </header>
        <div className="absolute end-[2.75rem] top-3.5 z-10">
          <PageTourButton tourId="automations-create" size="sm" />
        </div>
        <DialogClose />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] p-4">
            {step === 1 ? (
              <div className="flex flex-col gap-3.5">
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Identificação
                </p>
                <label className="flex flex-col gap-1.5">
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    Nome
                  </span>
                  <div data-tour="create-name">
                    <InputGlass
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Boas-vindas no WhatsApp"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        goNext();
                      }
                    }}
                    />
                  </div>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--text-muted)]">
                    Descrição
                  </span>
                  <div data-tour="create-description">
                    <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="O que esta automação faz?"
                    rows={3}
                    className="w-full resize-none"
                    />
                  </div>
                </label>
              </div>
            ) : null}

            {step === 2 ? (
              <div data-tour="create-trigger" className="flex flex-col gap-3">
                <p className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Gatilho
                </p>
                <div className="grid max-h-[min(42vh,360px)] grid-cols-1 gap-2 overflow-y-auto pr-0.5 md:grid-cols-2">
                  {AUTOMATION_TRIGGER_TYPES.map((t) => {
                    const selected = triggerType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTriggerType(t)}
                        className={cn(
                          "flex items-center gap-3 rounded-[var(--radius-md)] border px-3.5 py-2.5 text-left font-body text-[13px] transition-all",
                          selected
                            ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--text-primary)]"
                            : "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-secondary)] hover:border-[var(--brand-primary)]/40",
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                            selected
                              ? "border-[var(--brand-primary)] bg-[var(--brand-primary)]"
                              : "border-[var(--glass-border)]",
                          )}
                        >
                          {selected ? (
                            <span className="size-1.5 rounded-full bg-white" />
                          ) : null}
                        </span>
                        {triggerTypeLabel(t)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div data-tour="create-options" className="flex flex-col gap-3.5">
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3.5 py-3">
                  <SwitchGlass
                    checked={allowManualRun}
                    onChange={setAllowManualRun}
                    aria-label="Habilitar para o agente enviar"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[13px] font-bold text-[var(--text-primary)]">
                      Habilitar para o agente enviar
                    </span>
                    <span className="mt-0.5 block font-body text-[12px] leading-snug text-[var(--text-muted)]">
                      Deixa esta automação disponível para o agente disparar
                      manualmente pela conversa (menu “+” do composer), além do
                      gatilho automático.
                    </span>
                  </span>
                </label>

                <div className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3.5 py-3">
                  <p className="font-display text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    Resumo
                  </p>
                  <dl className="mt-2.5 grid gap-2 font-body text-[13px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-muted)]">Nome</dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {name.trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-muted)]">Descrição</dt>
                      <dd className="max-w-[60%] truncate text-right text-[var(--text-primary)]">
                        {description.trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-muted)]">Gatilho</dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {triggerTypeLabel(triggerType)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-[var(--text-muted)]">
                        Disparo manual pelo agente
                      </dt>
                      <dd className="text-[var(--text-primary)]">
                        {allowManualRun ? "Habilitado" : "Desabilitado"}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-between border-t border-[var(--glass-border-subtle)] px-6 py-3.5">
          <button
            type="button"
            onClick={() => {
              if (step === 1) closeModal();
              else setStep((s) => (s - 1) as StepId);
            }}
            className="font-display text-[13px] font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            {step === 1 ? "← Cancelar" : "← Voltar"}
          </button>
          {step < 3 ? (
            <button
              type="button"
              data-tour="create-next"
              onClick={goNext}
              className="inline-flex items-center rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white transition-opacity hover:opacity-90"
            >
              Próximo →
            </button>
          ) : (
            <button
              type="button"
              data-tour="create-submit"
              onClick={() => void handleCreate()}
              disabled={createMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 py-2 font-display text-[13px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              <IconSparkles size={15} />
              {createMutation.isPending ? "Criando..." : "Criar e abrir builder"}
            </button>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}
