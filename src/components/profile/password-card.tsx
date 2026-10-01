"use client";

/**
 * Card "Trocar senha" + "Outros dispositivos" do perfil.
 *
 * Trocar a senha (e "sair dos outros dispositivos") encerra as OUTRAS
 * sessões do usuário; a deste navegador continua: o backend devolve uma
 * prova de uso único e `runWithSessionRenewal` a troca pelo cookie na
 * versão nova (`lib/session-renewal.ts`). Se a renovação não der certo —
 * ou o backend não oferecer a prova —, vale o caminho antigo: login.
 */

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  IconKey as Key,
  IconLoader2 as Loader2,
  IconLogout as LogOut,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { GlassCard } from "@/components/crm/glass-card";
import { InputGlass } from "@/components/crm/input-glass";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/hooks/use-confirm";
import { apiUrl } from "@/lib/api";
import { runWithSessionRenewal } from "@/lib/session-renewal";
import { signOutToLogin } from "@/lib/sign-out-to-login";

async function readJson(res: Response): Promise<Record<string, unknown>> {
  const body: unknown = await res.json().catch(() => ({}));
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function messageOf(body: Record<string, unknown>, fallback: string): string {
  return typeof body.message === "string" && body.message ? body.message : fallback;
}

/** `PUT /api/profile` com a senha; lança `Error` com a mensagem do backend. */
async function putPassword(currentPassword: string, newPassword: string) {
  const res = await fetch(apiUrl("/api/profile"), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(messageOf(body, "Erro ao trocar a senha"));
  return body;
}

/** `POST /api/me/sessions/revoke-all`. */
async function postRevokeAll(keepCurrent: boolean) {
  const res = await fetch(apiUrl("/api/me/sessions/revoke-all"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keepCurrent }),
  });
  const body = await readJson(res);
  if (!res.ok) throw new Error(messageOf(body, "Não foi possível encerrar as sessões"));
  return body;
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]"
      >
        {label}
        <span className="ml-0.5 text-primary">*</span>
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-[var(--color-ink-muted)]">{hint}</p> : null}
    </div>
  );
}

export function PasswordCard() {
  const { update } = useSession();
  const confirm = useConfirm();
  const [currentPassword, setCurrentPassword] = React.useState("");
  const [newPassword, setNewPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [keepCurrent, setKeepCurrent] = React.useState(true);

  const passwordMutation = useMutation({
    mutationFn: () =>
      runWithSessionRenewal(() => putPassword(currentPassword, newPassword), update),
    onSuccess: ({ session }) => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      if (session === "kept") {
        toast.success("Senha alterada. As outras sessões foram encerradas.");
      } else if (session === "lost") {
        // A senha mudou, mas esta sessão não pôde ser mantida.
        toast.success("Senha alterada. Entre novamente com a nova senha.");
        void signOutToLogin();
      } else {
        toast.success("Senha atualizada");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeMutation = useMutation({
    mutationFn: async (keep: boolean) => {
      if (!keep) {
        await postRevokeAll(false);
        return "lost" as const;
      }
      const { session } = await runWithSessionRenewal(() => postRevokeAll(true), update);
      // Sem prova, o backend derrubou esta sessão junto com as outras.
      return session === "kept" ? ("kept" as const) : ("lost" as const);
    },
    onSuccess: (session, keep) => {
      if (session === "kept") {
        toast.success(
          "Sessões encerradas nos outros dispositivos. Você continua conectado aqui.",
        );
        return;
      }
      toast.success(
        keep
          ? "Sessões encerradas. Entre novamente para continuar."
          : "Você saiu de todos os dispositivos.",
      );
      void signOutToLogin();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const tooShort = newPassword.length > 0 && newPassword.length < 8;
  const busy = passwordMutation.isPending || revokeMutation.isPending;
  const canSubmit =
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !busy;

  const handleRevoke = async () => {
    if (busy) return;
    const ok = await confirm({
      title: keepCurrent ? "Sair dos outros dispositivos?" : "Sair de todos os dispositivos?",
      description: keepCurrent
        ? "As sessões abertas em outros navegadores e aparelhos serão encerradas. Você continua conectado neste."
        : "Todas as sessões serão encerradas, inclusive esta. Você precisará entrar novamente.",
      confirmLabel: "Encerrar sessões",
      destructive: !keepCurrent,
    });
    if (ok) revokeMutation.mutate(keepCurrent);
  };

  return (
    <GlassCard variant="overlay" className="min-w-0 p-5 sm:p-8">
      <h2 className="font-display text-lg font-bold text-[var(--text-primary)]">
        Trocar senha
      </h2>
      <p className="mt-1 max-w-md text-sm leading-snug text-[var(--text-muted)]">
        Informe sua senha atual e escolha uma nova com pelo menos 8 caracteres. As
        sessões abertas em outros dispositivos serão encerradas; esta continua.
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) passwordMutation.mutate();
        }}
      >
        <Field id="current-password" label="Senha atual">
          <InputGlass
            id="current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Field
          id="new-password"
          label="Nova senha"
          hint={tooShort ? "Use pelo menos 8 caracteres." : undefined}
        >
          <InputGlass
            id="new-password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <Field
          id="confirm-password"
          label="Confirmar nova senha"
          hint={mismatch ? "As senhas não coincidem." : undefined}
        >
          <InputGlass
            id="confirm-password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Field>

        <ButtonGlass
          type="submit"
          variant="primary"
          disabled={!canSubmit}
          className="mt-2 h-11 w-full text-sm disabled:opacity-60"
        >
          {passwordMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Key className="size-4" />
          )}
          Atualizar senha
        </ButtonGlass>
      </form>

      <div className="mt-8 border-t border-[var(--glass-border)] pt-6">
        <h3 className="font-display text-base font-bold text-[var(--text-primary)]">
          Outros dispositivos
        </h3>
        <p className="mt-1 max-w-md text-sm leading-snug text-[var(--text-muted)]">
          Encerre as sessões abertas em outros navegadores e aparelhos — por exemplo,
          se você esqueceu a conta aberta em um computador compartilhado.
        </p>

        <label className="mt-4 flex cursor-pointer items-center gap-3">
          <SwitchGlass
            checked={keepCurrent}
            onChange={setKeepCurrent}
            disabled={busy}
            aria-label="Manter este dispositivo conectado"
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">
            Manter este dispositivo conectado
          </span>
        </label>

        <ButtonGlass
          type="button"
          variant={keepCurrent ? "glass" : "danger"}
          disabled={busy}
          onClick={() => void handleRevoke()}
          className="mt-4 h-11 w-full text-sm disabled:opacity-60"
        >
          {revokeMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <LogOut className="size-4" />
          )}
          {keepCurrent ? "Sair dos outros dispositivos" : "Sair de todos os dispositivos"}
        </ButtonGlass>
      </div>
    </GlassCard>
  );
}
