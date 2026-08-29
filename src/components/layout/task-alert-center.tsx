"use client";

import { IconClockHour4, IconX } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import { toast } from "sonner";

import {
  isStaleActivityAlertError,
  type ActivityAlertDto,
  type ActivityAlertResponse,
} from "@/features/directory-v2/api";
import {
  ACTIVITY_ALERT_KEY,
  useActivityAlert,
  useDismissActivityAlert,
  useSnoozeActivityAlert,
} from "@/features/directory-v2/hooks";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/activities-data";
import { cn } from "@/lib/utils";
import { useIdleEnabled } from "@/hooks/use-idle-enabled";

const TYPE_TO_KIND: Record<string, ActivityKind> = {
  CALL: "ligacao",
  MEETING: "reuniao",
  EMAIL: "email",
  TASK: "tarefa",
  OTHER: "evento",
};

function alertHeadline(alert: ActivityAlertDto): string {
  if (alert.kind === "PRE_DUE") return "Tarefa em 15 minutos";
  const due = new Date(alert.scheduledAt);
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
    return "Tarefa vencida";
  }
  return "Tarefa no horário";
}

function typeLabel(type: string): string {
  const kind = TYPE_TO_KIND[type];
  if (kind) return ACTIVITY_KINDS[kind].label;
  return type;
}

function contextLabel(alert: ActivityAlertDto): string | null {
  if (alert.deal?.title) return alert.deal.title;
  if (alert.contact?.name) return alert.contact.name;
  if (alert.department?.name) return alert.department.name;
  return null;
}

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskAlertCenter() {
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const router = useRouter();
  const qc = useQueryClient();

  const idle = useIdleEnabled();
  const { data } = useActivityAlert(authenticated && idle);
  const dismissMutation = useDismissActivityAlert();
  const snoozeMutation = useSnoozeActivityAlert();

  const alert = data?.alert ?? null;
  const busy = dismissMutation.isPending || snoozeMutation.isPending;

  const headline = useMemo(
    () => (alert ? alertHeadline(alert) : ""),
    [alert],
  );
  const context = useMemo(
    () => (alert ? contextLabel(alert) : null),
    [alert],
  );

  const dropStaleAlert = useCallback(() => {
    qc.setQueryData<ActivityAlertResponse>(ACTIVITY_ALERT_KEY, { alert: null });
    void qc.invalidateQueries({ queryKey: ACTIVITY_ALERT_KEY });
  }, [qc]);

  const handleActionError = useCallback(
    (err: unknown, fallback: string) => {
      toast.error(err instanceof Error ? err.message : fallback);
      if (isStaleActivityAlertError(err)) dropStaleAlert();
    },
    [dropStaleAlert],
  );

  const runDismiss = useCallback(
    async (thenNavigate: boolean) => {
      if (!alert || busy) return;
      if (thenNavigate) router.push("/activities");
      try {
        await dismissMutation.mutateAsync({ activityId: alert.id });
      } catch (err) {
        handleActionError(err, "Não foi possível fechar o alerta.");
      }
    },
    [alert, busy, dismissMutation, handleActionError, router],
  );

  const runSnooze = useCallback(async () => {
    if (!alert || busy) return;
    try {
      await snoozeMutation.mutateAsync({
        activityId: alert.id,
        kind: alert.kind,
      });
    } catch (err) {
      handleActionError(err, "Não foi possível adiar o alerta.");
    }
  }, [alert, busy, handleActionError, snoozeMutation]);

  if (!authenticated || !alert) return null;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-(--z-above)",
        "inset-x-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] flex justify-center",
        "md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:justify-end",
      )}
      aria-live="polite"
    >
      {/* Container visual — sem role interativo */}
      <div
        className={cn(
          "pointer-events-auto relative w-full max-w-[360px] md:w-[360px]",
          "rounded-[var(--radius-xl)] border border-[var(--glass-border)]",
          "bg-[var(--glass-bg-modal)]/95 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
          "text-[var(--text-primary)]",
          "transition-[opacity,transform] duration-200 ease-out",
          "motion-reduce:transition-none",
          "animate-in fade-in-0 slide-in-from-bottom-2",
          "motion-reduce:animate-none",
          busy && "opacity-70",
        )}
        aria-busy={busy || undefined}
      >
        {/* Área principal: abre atividades (irmão das ações, não pai) */}
        <button
          type="button"
          disabled={busy}
          aria-label={`${headline}: ${alert.title}. Abrir atividades.`}
          onClick={() => void runDismiss(true)}
          className={cn(
            "absolute inset-0 z-0 rounded-[inherit]",
            "cursor-pointer outline-none",
            "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-primary)]/50",
            "disabled:cursor-default",
          )}
        />

        {/* Camada de conteúdo: transparente ao clique para o botão de baixo
            receber o toque; só as ações reativam pointer-events. */}
        <div className="pointer-events-none relative z-10 flex items-start gap-3 p-3.5 pr-2">
          <div
            className={cn(
              "pointer-events-none mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
              alert.kind === "PRE_DUE"
                ? "bg-[color-mix(in_srgb,var(--brand-primary)_16%,transparent)] text-[var(--brand-primary)]"
                : "bg-[color-mix(in_srgb,#f59e0b_18%,transparent)] text-[#d97706]",
            )}
            aria-hidden
          >
            <IconClockHour4 className="size-5" strokeWidth={2.2} />
          </div>

          <div className="pointer-events-none min-w-0 flex-1">
            <p className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {headline}
            </p>
            <p className="mt-0.5 truncate font-display text-[14px] font-semibold leading-snug text-[var(--text-primary)]">
              {alert.title}
            </p>
            <p className="mt-1 text-[12px] font-medium text-[var(--text-secondary)]">
              {formatScheduledAt(alert.scheduledAt)}
              <span className="text-[var(--text-muted)]"> · </span>
              {typeLabel(alert.type)}
            </p>
            {context ? (
              <p className="mt-0.5 truncate text-[12px] text-[var(--text-muted)]">
                {context}
              </p>
            ) : null}

            <div className="pointer-events-auto mt-2.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => void runSnooze()}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border border-[var(--glass-border)]",
                  "bg-[var(--glass-bg-strong)] px-3 font-display text-[12px] font-semibold",
                  "text-[var(--text-secondary)] transition-colors",
                  "hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]",
                  "disabled:pointer-events-none disabled:opacity-50",
                  "motion-reduce:transition-none",
                )}
              >
                Adiar 10 min
              </button>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            aria-label="Fechar alerta"
            onClick={() => void runDismiss(false)}
            className={cn(
              "pointer-events-auto relative z-10 shrink-0 rounded-full p-1.5 text-[var(--text-muted)] transition-colors",
              "hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]",
              "disabled:pointer-events-none disabled:opacity-50",
              "motion-reduce:transition-none",
            )}
          >
            <IconX className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}
