"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconLoader2 } from "@tabler/icons-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { TEAM_USERS_QUERY_PREFIX } from "@/features/shared/queries/team-users";
import { cn } from "@/lib/utils";

/** Formato de `GET /api/users/:id/telephony` (e do `telephony` em `GET /api/users`). */
export interface TelephonyStatus {
  telephonyEnabled: boolean;
  provisioningStep: string;
  provisioningError: string | null;
  provisionedAt: string | null;
}

interface TelephonyToggleProps {
  userId: string;
  /** Só o switch (+ retry se falhou). Sem labels Ativo/Falhou ao lado. */
  compact?: boolean;
  /**
   * Status que já veio na lista (`GET /api/users`, campo `telephony`):
   *  - objeto: usa este, sem buscar;
   *  - `null`: sem telefonia, sem buscar;
   *  - `undefined` (backend antigo, lista sem o campo): busca
   *    `GET /api/users/:id/telephony` como antes.
   */
  telephony?: TelephonyStatus | null;
}

const NO_TELEPHONY: TelephonyStatus = {
  telephonyEnabled: false,
  provisioningStep: "IDLE",
  provisioningError: null,
  provisionedAt: null,
};

/**
 * A lista de `GET /api/users` traz o campo `telephony`? Se NENHUM usuário
 * tem a chave, é o backend antigo: cada linha busca o próprio status.
 */
export function userListCarriesTelephony(users: readonly object[]): boolean {
  return users.some((u) => Object.prototype.hasOwnProperty.call(u, "telephony"));
}

async function fetchStatus(userId: string): Promise<TelephonyStatus> {
  const res = await fetch(`/api/users/${userId}/telephony`);
  if (!res.ok) throw new Error("Falha ao buscar status");
  return res.json();
}

async function patchTelephony(userId: string, enabled: boolean) {
  const res = await fetch(`/api/users/${userId}/telephony`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message ?? "Erro");
  }
  return res.json();
}

export function TelephonyToggle({ userId, compact = false, telephony }: TelephonyToggleProps) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const fromList = telephony !== undefined;

  // Só busca por linha quando a lista não trouxe o status (backend antigo).
  const { data: fetched, isLoading } = useQuery({
    queryKey: ["telephony-status", userId],
    queryFn: () => fetchStatus(userId),
    enabled: !fromList,
  });
  const status = fromList ? (telephony ?? NO_TELEPHONY) : fetched;

  const invalidate = () => {
    if (fromList) {
      // O status vem da lista: ela é que precisa recarregar.
      void queryClient.invalidateQueries({ queryKey: TEAM_USERS_QUERY_PREFIX });
    } else {
      void queryClient.invalidateQueries({ queryKey: ["telephony-status", userId] });
    }
    void queryClient.invalidateQueries({ queryKey: ["sip-extensions"] });
  };

  const mutation = useMutation({
    mutationFn: (enabled: boolean) => patchTelephony(userId, enabled),
    onSettled: invalidate,
  });

  if (!fromList && isLoading) {
    return <IconLoader2 size={14} className="animate-spin text-[var(--text-muted)]" />;
  }

  const enabled = status?.telephonyEnabled ?? false;
  const step = status?.provisioningStep ?? "IDLE";
  const error = mutation.error?.message ?? status?.provisioningError;
  const isProvisioning =
    mutation.isPending || (enabled && step !== "ACTIVE" && step !== "FAILED" && step !== "DISABLED");
  const isDisabling = mutation.isPending && mutation.variables === false;

  async function handleToggle() {
    if (enabled) {
      const ok = await confirm({
        title: "Desativar telefonia?",
        description:
          "O ramal e o usuário serão apagados na API4Comm. O histórico de chamadas no CRM permanece. Religar cria um ramal novo.",
        confirmLabel: "Desativar e apagar",
        destructive: true,
      });
      if (!ok) return;
      mutation.mutate(false);
      return;
    }
    mutation.mutate(true);
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Telefonia"
        disabled={mutation.isPending}
        onClick={() => void handleToggle()}
        className={cn(
          compact
            ? "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
            : "relative h-5 w-9 shrink-0 rounded-full border transition-colors",
          compact
            ? enabled
              ? "bg-primary"
              : "bg-muted-foreground/30"
            : enabled
              ? "border-[var(--color-success)] bg-[var(--color-success)]"
              : "border-[var(--text-muted)] bg-[var(--text-muted)]/35",
          mutation.isPending && "opacity-50",
        )}
      >
        <span
          className={cn(
            "rounded-full transition-transform",
            compact
              ? "inline-block size-5 bg-background shadow-sm"
              : "absolute top-0.5 left-0.5 h-4 w-4 bg-white",
            compact ? (enabled ? "translate-x-[22px]" : "translate-x-0.5") : enabled && "translate-x-4",
          )}
        />
      </button>

      {isProvisioning && (
        <span className="flex items-center gap-1 text-xs text-[var(--color-warning)]/80">
          <IconLoader2 size={11} className="animate-spin" />
          {compact ? null : isDisabling ? "Removendo…" : "Provisionando…"}
        </span>
      )}

      {step === "FAILED" && (
        <button
          type="button"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate(true)}
          className="text-xs text-[var(--brand-primary)] underline-offset-2 hover:underline disabled:opacity-50"
        >
          Tentar de novo
        </button>
      )}

      {!compact && step === "ACTIVE" && enabled && !mutation.isPending && (
        <span className="text-xs text-[var(--color-success)]/80">Ativo</span>
      )}

      {!compact && mutation.isError && step !== "FAILED" && (
        <span className="max-w-[140px] truncate text-xs text-[var(--color-danger)]" title={error ?? undefined}>
          {error ?? "Erro"}
        </span>
      )}

      {dialog}
    </div>
  );
}
