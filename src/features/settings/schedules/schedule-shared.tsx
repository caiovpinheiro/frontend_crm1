"use client";

import * as React from "react";
import { IconCheck as Check, IconClock, IconLoader2 as Loader2, IconX as X } from "@tabler/icons-react";

import { InputGlass } from "@/components/crm/input-glass";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Blocos compartilhados de expediente entre a lista clássica
 * (`legacy-v1/settings/schedules.tsx`) e a grade de cobertura
 * (`/settings/coverage`).
 */

export type Schedule = {
  startTime: string;
  lunchStart: string;
  lunchEnd: string;
  endTime: string;
  timezone: string;
  weekdays: number[];
  /** Expediente de sábado (elegibilidade sem almoço). Opcionais: o PUT de
   * schedule não os gerencia, mas o GET retorna para a grade de cobertura. */
  saturdayEnabled?: boolean;
  saturdayStart?: string;
  saturdayEnd?: string;
};

export const WEEKDAYS = [
  { value: 0, short: "Dom", label: "Domingo" },
  { value: 1, short: "Seg", label: "Segunda" },
  { value: 2, short: "Ter", label: "Terça" },
  { value: 3, short: "Qua", label: "Quarta" },
  { value: 4, short: "Qui", label: "Quinta" },
  { value: 5, short: "Sex", label: "Sexta" },
  { value: 6, short: "Sáb", label: "Sábado" },
] as const;

export const DEFAULT_SCHEDULE: Schedule = {
  startTime: "08:00",
  lunchStart: "12:00",
  lunchEnd: "13:00",
  endTime: "18:00",
  timezone: "America/Sao_Paulo",
  weekdays: [1, 2, 3, 4, 5],
};

/** Sub-form reutilizável de horário (edição individual + template em massa). */
export function ScheduleFields({
  schedule,
  onChange,
}: {
  schedule: Schedule;
  onChange: (next: Schedule) => void;
}) {
  const toggleWeekday = (day: number) => {
    onChange({
      ...schedule,
      weekdays: schedule.weekdays.includes(day)
        ? schedule.weekdays.filter((d) => d !== day)
        : [...schedule.weekdays, day].sort(),
    });
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0 w-full space-y-1.5">
          <Label>Início expediente</Label>
          <InputGlass
            type="time"
            value={schedule.startTime}
            onChange={(e) => onChange({ ...schedule, startTime: e.target.value })}
            className="w-full"
          />
        </div>
        <div className="min-w-0 w-full space-y-1.5">
          <Label>Fim expediente</Label>
          <InputGlass
            type="time"
            value={schedule.endTime}
            onChange={(e) => onChange({ ...schedule, endTime: e.target.value })}
            className="w-full"
          />
        </div>
        <div className="min-w-0 w-full space-y-1.5">
          <Label>Início almoço</Label>
          <InputGlass
            type="time"
            value={schedule.lunchStart}
            onChange={(e) => onChange({ ...schedule, lunchStart: e.target.value })}
            className="w-full"
          />
        </div>
        <div className="min-w-0 w-full space-y-1.5">
          <Label>Fim almoço</Label>
          <InputGlass
            type="time"
            value={schedule.lunchEnd}
            onChange={(e) => onChange({ ...schedule, lunchEnd: e.target.value })}
            className="w-full"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Dias de trabalho</Label>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((wd) => {
            const active = schedule.weekdays.includes(wd.value);
            return (
              <button
                key={wd.value}
                type="button"
                onClick={() => toggleWeekday(wd.value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold transition-colors",
                  active
                    ? "bg-[var(--brand-primary)] text-white shadow-sm"
                    : "border border-[var(--glass-border)] bg-[var(--glass-bg-panel)] text-[var(--text-muted)] hover:border-[var(--brand-primary)] hover:text-[var(--text-primary)]",
                )}
              >
                {active && <Check className="size-3" />}
                {wd.short}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Shell de modal no padrão dos filtros (kanban/inbox) ─────────────────────

/**
 * Moldura visual das modais de expediente, alinhada às modais de filtros do
 * kanban (`variant-modal-two-col`) e do inbox (`filter-panel`):
 *
 * - header com quadrado de ícone `bg-[var(--color-enterprise-bg)]` + título
 *   `font-display 16px bold tracking-tight` + hint 12px muted, separado por
 *   `border-b border-[var(--glass-border-subtle)]`;
 * - conteúdo `px-5 py-5`;
 * - footer `border-t` + `bg-[var(--glass-bg-panel)]` com botão ghost
 *   (Cancelar) e primário flat `bg-[var(--brand-primary)]` + shadow brand.
 *
 * O `<form>` é interno: `onSubmit` recebe o submit já com preventDefault.
 */
export function ScheduleDialogShell({
  open,
  onOpenChange,
  title,
  description,
  icon = <IconClock className="size-4" />,
  submitLabel,
  submitPending = false,
  submitDisabled = false,
  error,
  onSubmit,
  headerAccessory,
  submitTourId,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  icon?: React.ReactNode;
  submitLabel: string;
  submitPending?: boolean;
  submitDisabled?: boolean;
  /** Mensagem/erro renderizado entre o conteúdo e o footer. */
  error?: React.ReactNode;
  onSubmit: () => void;
  /** Conteúdo extra no header (ex.: botão de tour), à esquerda do X. */
  headerAccessory?: React.ReactNode;
  /** `data-tour` no botão de submit (product tour). */
  submitTourId?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" bodyClassName="gap-0 p-0">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--glass-border-subtle)] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[16px] font-bold tracking-tight text-[var(--text-primary)]">
                {title}
              </h2>
              <p className="font-body text-[12px] text-[var(--text-muted)]">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerAccessory}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
              aria-label="Fechar"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex min-h-0 flex-col"
        >
          <div className="space-y-4 px-5 py-5">{children}</div>

          {error}

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--glass-border-subtle)] bg-[var(--glass-bg-panel)] px-5 py-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex h-9 items-center rounded-[var(--radius-md)] px-3 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitPending || submitDisabled}
              data-tour={submitTourId}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--brand-primary)] px-4 font-display text-[12px] font-bold text-white shadow-[0_4px_12px_rgba(91,111,245,0.35)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {submitPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check size={13} />
              )}
              {submitLabel}
            </button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}
