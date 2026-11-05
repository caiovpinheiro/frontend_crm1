"use client";

/**
 * Coluna "Elegível" da Distribuição por Leads: se o consultor recebe lead
 * agora e por quê, e (para quem gerencia) liberar ou pausar até um horário.
 * A liberação/pausa é temporária: no fim volta a regra do departamento.
 */

import { useState } from "react";
import { IconCircleCheck, IconClockHour4, IconClockPause } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { useLeadsEligibilityOverride } from "./leads-hooks";
import type { LeadsEligibilityDto, LeadsParticipantDto } from "./leads-types";

const TZ = "America/Sao_Paulo";

/** "22:00" no horário de Brasília. */
export function formatClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
}

function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** "até 22:00" ou "até amanhã 08:00". */
export function untilLabel(iso: string, now: Date = new Date()): string {
  const end = new Date(iso);
  const tomorrow = dayKey(end) !== dayKey(now);
  return `até ${tomorrow ? "amanhã " : ""}${formatClock(iso)}`;
}

/** Minuto do dia em Brasília. */
function nowMinuteSp(now: Date): number {
  const [h, m] = formatClock(now.toISOString()).split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** O horário escolhido cai amanhã? (já passou hoje, ou é agora). */
export function endsTomorrow(until: string, now: Date = new Date()): boolean {
  const match = /^(\d{2}):(\d{2})$/.exec(until);
  if (!match) return false;
  const target = Number(match[1]) * 60 + Number(match[2]);
  return target <= nowMinuteSp(now);
}

type BadgeTone = "ok" | "manual-ok" | "manual-off" | "off";

const REASON_TEXT: Record<LeadsEligibilityDto["reason"], string> = {
  INACTIVE: "Inativo",
  WEIGHT_ZERO: "Peso 0",
  OVERRIDE_INELIGIBLE: "Pausado manualmente",
  OVERRIDE_ELIGIBLE: "Liberado manualmente",
  RULES_OFF: "Rodízio sem regra de horário",
  DEPARTMENT_ACTIVE: "Departamento no horário",
  OUT_OF_HOURS: "Fora do horário do departamento",
};

export function describeEligibilityBadge(e: LeadsEligibilityDto | undefined, now: Date = new Date()) {
  if (!e) return null;
  const tone: BadgeTone = e.override
    ? e.override.eligible
      ? "manual-ok"
      : "manual-off"
    : e.eligibleNow
      ? "ok"
      : "off";
  const label = e.eligibleNow ? "Elegível" : "Inelegível";
  const detail =
    e.override && (e.reason === "OVERRIDE_ELIGIBLE" || e.reason === "OVERRIDE_INELIGIBLE")
      ? `${e.override.eligible ? "Liberado" : "Pausado"} ${untilLabel(e.override.endsAt, now)}`
      : REASON_TEXT[e.reason];
  return { tone, label, detail };
}

const TONE_CLASS: Record<BadgeTone, string> = {
  ok: "bg-success-soft text-success",
  "manual-ok": "bg-primary/10 text-primary",
  "manual-off": "bg-warning-soft text-warning",
  off: "bg-secondary text-muted-foreground",
};

export function EligibilityCell({
  participant,
  canManage,
  onManage,
}: {
  participant: LeadsParticipantDto;
  canManage: boolean;
  onManage: (p: LeadsParticipantDto) => void;
}) {
  const badge = describeEligibilityBadge(participant.eligibility);
  if (!badge) return <span className="text-[12px] text-muted-foreground">—</span>;
  const e = participant.eligibility!;
  const canAct = canManage && (e.override || (e.reason !== "INACTIVE" && e.reason !== "WEIGHT_ZERO"));
  const action = e.override ? "Alterar" : e.eligibleNow ? "Pausar até…" : "Liberar até…";

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <span
        className={cn(
          "inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 font-display text-[12px] font-bold",
          TONE_CLASS[badge.tone],
        )}
      >
        {e.eligibleNow ? <IconCircleCheck size={13} /> : <IconClockPause size={13} />}
        {badge.label}
      </span>
      <span className="truncate font-body text-[11.5px] text-muted-foreground" title={badge.detail}>
        {badge.detail}
      </span>
      {canAct ? (
        <button
          type="button"
          onClick={() => onManage(participant)}
          className="cursor-pointer font-display text-[12px] font-semibold text-primary transition-colors hover:underline"
        >
          {action}
        </button>
      ) : null}
    </div>
  );
}

/** Próxima hora cheia (sugestão do campo). */
function suggestedUntil(now: Date): string {
  const next = (Math.floor(nowMinuteSp(now) / 60) + 1) % 24;
  return `${String(next).padStart(2, "0")}:00`;
}

export function EligibilityOverrideDialog({
  participant,
  onClose,
}: {
  participant: LeadsParticipantDto | null;
  onClose: () => void;
}) {
  const mutation = useLeadsEligibilityOverride();
  const e = participant?.eligibility;
  // Com liberação/pausa vigente, a ação padrão mantém o tipo; sem, inverte a situação.
  const defaultEligible = e?.override ? e.override.eligible : !e?.eligibleNow;
  const [eligible, setEligible] = useState<boolean>(defaultEligible);
  const [until, setUntil] = useState<string>(() =>
    e?.override ? formatClock(e.override.endsAt) : suggestedUntil(new Date()),
  );
  const busy = mutation.isPending;
  const name = participant?.name ?? participant?.email ?? "Consultor";
  const valid = /^\d{2}:\d{2}$/.test(until);
  const tomorrow = valid && endsTomorrow(until);

  async function submit(input: { eligible: boolean; until: string } | null) {
    if (!participant) return;
    try {
      await mutation.mutateAsync({ userId: participant.userId, input });
      toast.success(
        !input
          ? `${name} voltou ao horário do departamento.`
          : input.eligible
            ? `${name} liberado até ${tomorrow ? "amanhã " : ""}${input.until}.`
            : `${name} pausado até ${tomorrow ? "amanhã " : ""}${input.until}.`,
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar.");
    }
  }

  return (
    <FormDialog
      open={participant !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={eligible ? `Liberar ${name}` : `Pausar ${name}`}
      description={
        eligible
          ? "Recebe leads a partir de agora até o horário escolhido, mesmo fora do horário do departamento. Depois volta à regra do departamento."
          : "Para de receber leads a partir de agora até o horário escolhido, mesmo no horário do departamento. Depois volta à regra do departamento."
      }
      icon={
        <FormDialogIcon>
          <IconClockHour4 className="size-4" />
        </FormDialogIcon>
      }
      busy={busy}
      footer={
        <>
          {e?.override ? (
            <ButtonGlass
              type="button"
              variant="glass"
              className={cn(formDialogCancelClass, "mr-auto")}
              disabled={busy}
              onClick={() => void submit(null)}
            >
              Encerrar agora
            </ButtonGlass>
          ) : null}
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={busy || !valid}
            onClick={() => void submit({ eligible, until })}
          >
            {busy ? "Salvando…" : eligible ? "Liberar" : "Pausar"}
          </ButtonGlass>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2" role="radiogroup" aria-label="Ação">
          {[
            { value: true, label: "Liberar (elegível)" },
            { value: false, label: "Pausar (inelegível)" },
          ].map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              role="radio"
              aria-checked={eligible === opt.value}
              disabled={busy}
              onClick={() => setEligible(opt.value)}
              className={cn(
                "h-8 cursor-pointer rounded-full border px-3 font-display text-[12.5px] font-semibold transition-colors",
                eligible === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <label className="block">
          <span className={formLabelClass}>Até</span>
          <Input
            type="time"
            aria-label="Até"
            className={formControlClass}
            value={until}
            onChange={(ev) => setUntil(ev.target.value)}
            disabled={busy}
          />
        </label>
        <p className="font-body text-[12px] text-muted-foreground">
          {valid
            ? `Começa agora e termina ${tomorrow ? "amanhã" : "hoje"} às ${until} (horário de Brasília).`
            : "Informe o horário de fim."}
        </p>
      </div>
    </FormDialog>
  );
}
