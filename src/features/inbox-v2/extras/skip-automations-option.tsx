"use client";

import { useEffect, useState } from "react";
import { IconBolt, IconBoltOff, IconCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { ResolveModeToggle, type ResolveMode } from "./resolve-mode-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Toggle visível só para ADMIN no encerramento de conversa. */
export function SkipAutomationsCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div
      role="group"
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border px-3.5 py-3.5 text-left transition-colors",
        checked
          ? "border-[var(--color-warning)] bg-[var(--color-warning)]/12"
          : "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)]",
      )}
    >
      <button
        type="button"
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
        onClick={() => onChange(!checked)}
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            checked
              ? "bg-[var(--color-warning)]/20 text-[var(--color-warning-text)]"
              : "bg-[var(--glass-bg-base)] text-[var(--text-muted)]",
          )}
        >
          {checked ? <IconBoltOff size={18} /> : <IconBolt size={18} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[13.5px] font-semibold leading-snug text-[var(--text-primary)]">
            Encerrar sem executar nenhuma automação
          </span>
          <span className="mt-0.5 block font-body text-[12px] leading-relaxed text-[var(--text-muted)]">
            {checked
              ? "Nenhum fluxo ligado ao encerramento será disparado."
              : "Os fluxos ligados ao encerramento serão disparados normalmente."}
          </span>
        </span>
      </button>
      <SwitchGlass
        checked={checked}
        onChange={onChange}
        aria-label="Encerrar sem executar nenhuma automação"
        className={
          checked
            ? "!bg-[var(--color-warning)] !shadow-[0_2px_8px_rgba(245,158,11,0.4)]"
            : undefined
        }
      />
    </div>
  );
}

/**
 * Confirm de encerrar (quando o departamento não exige tabulação).
 * Toggle Finalizar / Acompanhar para qualquer agente.
 */
export function ResolveConfirmDialog({
  open,
  onOpenChange,
  submitting,
  onConfirm,
  allowSkipAutomations = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  submitting?: boolean;
  onConfirm: (skipAutomations: boolean, followUp: boolean) => void;
  allowSkipAutomations?: boolean;
}) {
  const [skipAutomations, setSkipAutomations] = useState(false);
  const [mode, setMode] = useState<ResolveMode>("finalize");

  useEffect(() => {
    if (!open) {
      setSkipAutomations(false);
      setMode("finalize");
    }
  }, [open]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        size="sm"
        panelClassName="max-w-[440px]"
        bodyClassName="gap-5 p-6"
      >
        <AlertDialogHeader className="gap-0 text-left">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconCheck size={18} stroke={2.6} />
            </span>
            <div className="min-w-0">
              <AlertDialogTitle className="text-[18px] font-bold leading-snug">
                Encerrar conversa
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-1 text-[13px] leading-relaxed">
                Finalizar envia para Encerradas. Acompanhar deixa em
                Resolvendo e abre uma tarefa no calendário.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <ResolveModeToggle value={mode} onChange={setMode} />
        {allowSkipAutomations ? (
          <SkipAutomationsCheckbox
            checked={skipAutomations}
            onChange={setSkipAutomations}
          />
        ) : null}
        <AlertDialogFooter className="gap-2 sm:justify-end">
          <AlertDialogCancel
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onConfirm(skipAutomations, mode === "follow_up")}
            disabled={submitting}
          >
            {submitting
              ? "Salvando…"
              : mode === "follow_up"
                ? "Acompanhar"
                : "Finalizar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
