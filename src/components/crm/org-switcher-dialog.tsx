"use client";

/**
 * Seletor "Trocar de organização" (menu do avatar no desktop e "Mais" no
 * mobile). Lista as orgs do mesmo e-mail (`GET /api/me/organizations`),
 * destaca a atual e troca a sessão sem logout (`@/lib/org-switch`).
 *
 * Conta ainda não vinculada: a primeira troca pede a senha DELA (e o MFA,
 * se ligado) — o backend grava o vínculo e as próximas trocas não pedem.
 * Qualquer erro deixa a sessão atual como estava.
 */

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  IconBuildingSkyscraper,
  IconCheck,
  IconChevronRight,
  IconLink,
  IconLoader2,
  IconLock,
  IconSwitchHorizontal,
} from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import {
  FormDialog,
  FormDialogIcon,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { PasswordInput } from "@/components/ui/password-input";
import { ApiError } from "@/lib/api";
import {
  applyOrgSwitch,
  completeOrgSwitch,
  fetchSwitchableOrganizations,
  orgSwitchCredentialStep,
  requestOrgSwitch,
  type SwitchableOrganization,
} from "@/lib/org-switch";
import { cn } from "@/lib/utils";

export const SWITCHABLE_ORGS_QUERY_KEY = ["me", "organizations"] as const;

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrador",
  MANAGER: "Gestor",
  MEMBER: "Membro",
};

function OrgMark({ org }: { org: SwitchableOrganization }) {
  return (
    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-primary">
      {org.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={org.logoUrl} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        <span className="font-display text-[13px] font-bold">
          {org.name.trim().charAt(0).toUpperCase() || <IconBuildingSkyscraper size={16} />}
        </span>
      )}
    </span>
  );
}

type Step = "list" | "password" | "mfa";

export function OrgSwitcherDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { update } = useSession();
  const query = useQuery({
    queryKey: SWITCHABLE_ORGS_QUERY_KEY,
    queryFn: fetchSwitchableOrganizations,
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  const [selected, setSelected] = useState<SwitchableOrganization | null>(null);
  const [step, setStep] = useState<Step>("list");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [busyOrgId, setBusyOrgId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const mfaRef = useRef<HTMLInputElement>(null);
  const busy = busyOrgId !== null;

  // Fechar zera o passo (senha/MFA não ficam guardados para a próxima abertura).
  function handleOpenChange(next: boolean) {
    if (!next) {
      setSelected(null);
      setStep("list");
      setPassword("");
      setMfaCode("");
      setError(null);
    }
    onOpenChange(next);
  }

  useEffect(() => {
    const ref = step === "password" ? passwordRef : step === "mfa" ? mfaRef : null;
    if (ref) requestAnimationFrame(() => ref.current?.focus());
  }, [step]);

  async function runSwitch(org: SwitchableOrganization, creds?: { password: string; mfaCode?: string }) {
    setError(null);
    setBusyOrgId(org.organizationId);
    let keepBusy = false;
    try {
      const mfa = (creds?.mfaCode ?? "").trim();
      const grant = await requestOrgSwitch({
        organizationId: org.organizationId,
        ...(creds?.password ? { password: creds.password } : {}),
        // 6 dígitos = TOTP; o resto é tratado como código de backup.
        ...(mfa ? (/^\d{6}$/.test(mfa) ? { mfaCode: mfa } : { backupCode: mfa }) : {}),
      });
      const switched = await applyOrgSwitch(update, grant.ticket, grant.organization.id);
      if (!switched) {
        setError("Não foi possível trocar de organização. Você continua na organização atual.");
        return;
      }
      keepBusy = true; // a página vai navegar; mantém o estado de carregamento
      completeOrgSwitch(grant.organization);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      const credentialStep = orgSwitchCredentialStep(code);
      if (credentialStep) {
        setSelected(org);
        if (code === "password_required") {
          setError(null);
        } else {
          setError(e instanceof Error ? e.message : null);
        }
        if (credentialStep === "password") setMfaCode("");
        setStep(credentialStep);
        return;
      }
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Não foi possível trocar de organização. Tente novamente.",
      );
    } finally {
      if (!keepBusy) setBusyOrgId(null);
    }
  }

  function onPick(org: SwitchableOrganization) {
    if (busy || org.current) return;
    if (org.linked) {
      void runSwitch(org);
      return;
    }
    setSelected(org);
    setError(null);
    setPassword("");
    setMfaCode("");
    setStep("password");
  }

  function onSubmitCredentials(e: FormEvent) {
    e.preventDefault();
    if (!selected || busy || !password) return;
    void runSwitch(selected, { password, mfaCode: step === "mfa" ? mfaCode : undefined });
  }

  function backToList() {
    if (busy) return;
    setStep("list");
    setSelected(null);
    setPassword("");
    setMfaCode("");
    setError(null);
  }

  const orgs = query.data?.organizations ?? [];
  const others = orgs.filter((o) => !o.current);

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      busy={busy}
      size="sm"
      title="Trocar de organização"
      description={
        step === "list"
          ? "Organizações vinculadas ao seu e-mail."
          : `Confirme sua conta em ${selected?.name ?? "outra organização"}.`
      }
      icon={
        <FormDialogIcon>
          <IconSwitchHorizontal className="size-4" />
        </FormDialogIcon>
      }
      footer={
        step === "list" ? undefined : (
          <>
            <ButtonGlass
              type="button"
              variant="glass"
              className={formDialogCancelClass}
              onClick={backToList}
              disabled={busy}
            >
              Voltar
            </ButtonGlass>
            <ButtonGlass
              type="submit"
              form="org-switch-credentials"
              variant="primary"
              className={formDialogPrimaryClass}
              disabled={busy || !password || (step === "mfa" && !mfaCode.trim())}
            >
              {busy ? <IconLoader2 className="size-4 animate-spin" aria-hidden /> : null}
              Entrar
            </ButtonGlass>
          </>
        )
      }
    >
      {step === "list" ? (
        <div className="flex flex-col gap-2">
          {query.isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <IconLoader2 className="size-5 animate-spin" aria-label="Carregando" />
            </div>
          ) : query.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {query.error instanceof Error
                ? query.error.message
                : "Não foi possível carregar as organizações."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="Organizações">
              {orgs.map((org) => {
                const isBusy = busyOrgId === org.organizationId;
                return (
                  <li key={org.organizationId}>
                    <button
                      type="button"
                      onClick={() => onPick(org)}
                      disabled={busy || org.current}
                      aria-current={org.current ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all",
                        org.current
                          ? "cursor-default border-primary bg-primary/5 ring-2 ring-primary/15"
                          : "border-border bg-card hover:border-primary/40 hover:ring-2 hover:ring-primary/15 disabled:opacity-60",
                      )}
                    >
                      <OrgMark org={org} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-foreground">
                          {org.name}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {ROLE_LABEL[org.role] ?? org.role}
                          {org.current ? null : org.linked ? " · Vinculada" : " · Requer senha na primeira vez"}
                        </span>
                      </span>
                      {org.current ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          <IconCheck size={12} aria-hidden />
                          Atual
                        </span>
                      ) : isBusy ? (
                        <IconLoader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Trocando" />
                      ) : org.linked ? (
                        <IconLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : (
                        <IconLock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      )}
                      {!org.current && !isBusy ? (
                        <IconChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {query.isSuccess && others.length === 0 ? (
            <p className="rounded-xl bg-muted/40 px-3 py-3 text-center text-[12px] text-muted-foreground">
              Seu e-mail não está em outra organização ativa.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : (
        <form id="org-switch-credentials" onSubmit={onSubmitCredentials} className="flex flex-col gap-3">
          <p className="text-[12px] text-muted-foreground">
            Por segurança, informe a senha da sua conta nesta organização. Depois de
            confirmada, as próximas trocas não pedem senha.
          </p>
          <label className="block">
            <span className={formLabelClass}>Senha</span>
            <PasswordInput
              ref={passwordRef}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy || step === "mfa"}
              aria-label="Senha"
            />
          </label>
          {step === "mfa" ? (
            <label className="block">
              <span className={formLabelClass}>Código de autenticação (MFA)</span>
              <InputGlass
                ref={mfaRef}
                inputMode="text"
                autoComplete="one-time-code"
                placeholder="000000 ou código de backup"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                disabled={busy}
                aria-label="Código de autenticação"
              />
            </label>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          ) : null}
        </form>
      )}
    </FormDialog>
  );
}
