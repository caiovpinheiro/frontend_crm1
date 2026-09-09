"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import {
  ActivityReminderCard,
  type ActivityReminderAction,
} from "@/components/layout/activity-reminder-card";
import {
  isStaleActivityAlertError,
  type ActivityAlertDto,
  type ActivityAlertResponse,
} from "@/features/directory-v2/api";
import {
  ACTIVITY_ALERT_KEY,
  useActivityAlert,
  useDismissActivityAlert,
  useUpdateActivity,
} from "@/features/directory-v2/hooks";
import { useIdleEnabled } from "@/hooks/use-idle-enabled";

/**
 * Camada de dados do lembrete — um único callback para concluir / remarcar / fechar.
 * A UI vive em `ActivityReminderCard`.
 */
export function TaskAlertCenter() {
  const { status } = useSession();
  const authenticated = status === "authenticated";
  const qc = useQueryClient();
  const idle = useIdleEnabled();
  const { data } = useActivityAlert(authenticated && idle);
  const dismissMutation = useDismissActivityAlert();
  const updateMutation = useUpdateActivity();
  const [held, setHeld] = useState<ActivityAlertDto | null>(null);

  const live = data?.alert ?? null;
  const alert = held ?? live;

  const dropStaleAlert = useCallback(() => {
    qc.setQueryData<ActivityAlertResponse>(ACTIVITY_ALERT_KEY, { alert: null });
    void qc.invalidateQueries({ queryKey: ACTIVITY_ALERT_KEY });
    setHeld(null);
  }, [qc]);

  const handleAction = useCallback(
    async (action: ActivityReminderAction) => {
      if (!alert) return;
      setHeld(alert);
      try {
        if (action.type === "complete") {
          await updateMutation.mutateAsync({
            id: alert.id,
            payload: { completed: true },
          });
          await dismissMutation.mutateAsync({ activityId: alert.id });
          return;
        }
        if (action.type === "reschedule") {
          await updateMutation.mutateAsync({
            id: alert.id,
            payload: { scheduledAt: action.scheduledAt },
          });
          await dismissMutation.mutateAsync({ activityId: alert.id });
          return;
        }
        await dismissMutation.mutateAsync({ activityId: alert.id });
      } catch (err) {
        const fallback =
          action.type === "complete"
            ? "Não foi possível concluir a atividade."
            : action.type === "reschedule"
              ? "Não foi possível remarcar a atividade."
              : "Não foi possível fechar o alerta.";
        toast.error(err instanceof Error ? err.message : fallback);
        if (isStaleActivityAlertError(err)) dropStaleAlert();
        throw err;
      }
    },
    [alert, dismissMutation, dropStaleAlert, updateMutation],
  );

  if (!authenticated || !alert) return null;

  return (
    <ActivityReminderCard
      alert={alert}
      busy={dismissMutation.isPending || updateMutation.isPending}
      onAction={handleAction}
      onFinished={() => setHeld(null)}
    />
  );
}
