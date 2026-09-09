"use client";

import * as React from "react";
import { IconMailForward } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { InputGlass } from "@/components/crm/input-glass";
import { SwitchGlass } from "@/components/crm/switch-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import type { SmtpRelayInput, SmtpRelaySettings } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Config atual (null = ainda não configurado). */
  settings: SmtpRelaySettings | null;
  onSave: (input: SmtpRelayInput) => Promise<void>;
};

export function RelayFormDialog({ open, onOpenChange, settings, onSave }: Props) {
  const [host, setHost] = React.useState("");
  const [port, setPort] = React.useState("587");
  const [secure, setSecure] = React.useState(false);
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [clearPassword, setClearPassword] = React.useState(false);
  const [enabled, setEnabled] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* Rehidrata o form toda vez que o dialog abre (create ou edit). */
  React.useEffect(() => {
    if (!open) return;
    setHost(settings?.host ?? "");
    setPort(String(settings?.port ?? 587));
    setSecure(settings?.secure ?? false);
    setUsername(settings?.username ?? "");
    setPassword("");
    setClearPassword(false);
    setEnabled(settings?.enabled ?? true);
    setError(null);
  }, [open, settings]);

  /* Convenção de porta → criptografia (mesma regra das contas de e-mail):
     * 465 = TLS implícito; 25/587/2525/8025 = STARTTLS. Só sugere na troca
     * de porta — o usuário ainda pode virar o toggle manualmente depois. */
  function handlePortChange(value: string) {
    setPort(value);
    const n = Number(value);
    if (n === 465) setSecure(true);
    else if ([25, 587, 2525, 8025].includes(n)) setSecure(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const portNum = Number(port);
    if (!host.trim()) return setError("Informe o host do relay.");
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > 65535) {
      return setError("Porta inválida — use 465 (SSL) ou 587 (STARTTLS).");
    }
    setSubmitting(true);
    try {
      await onSave({
        host: host.trim(),
        port: portNum,
        secure,
        username: username.trim() || null,
        password: password || undefined,
        clearPassword: clearPassword || undefined,
        enabled,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar o relay.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={submitting}
      title={settings?.configured ? "Editar relay SMTP" : "Configurar relay SMTP"}
      description="Smarthost de saída usado quando o SMTP direto da conta está bloqueado."
      icon={
        <FormDialogIcon>
          <IconMailForward className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            variant="primary"
            className={formDialogPrimaryClass}
            type="submit"
            form="smtp-relay-form"
            disabled={submitting}
          >
            {submitting ? "Salvando…" : "Salvar relay"}
          </ButtonGlass>
        </>
      }
    >
      <form id="smtp-relay-form" onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <span className={formLabelClass}>Host *</span>
          <InputGlass
            className={formControlClass}
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="smtp.suaempresa.com"
            autoComplete="off"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={formLabelClass}>Porta *</span>
            <InputGlass
              className={formControlClass}
              value={port}
              onChange={(e) => handlePortChange(e.target.value)}
              inputMode="numeric"
              placeholder="587"
            />
          </div>
          <div className="flex items-end justify-between gap-2 pb-1">
            <span className={formLabelClass}>SSL/TLS (465)</span>
            <SwitchGlass
              checked={secure}
              onChange={setSecure}
              aria-label="TLS implícito (porta 465)"
            />
          </div>
        </div>

        <div>
          <span className={formLabelClass}>Usuário</span>
          <InputGlass
            className={formControlClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Opcional — relays liberados por IP não pedem"
            autoComplete="off"
          />
        </div>

        <div>
          <span className={formLabelClass}>Senha</span>
          <InputGlass
            className={formControlClass}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={
              settings?.hasPassword ? "Deixe em branco para manter a atual" : "Opcional"
            }
            autoComplete="new-password"
            disabled={clearPassword}
          />
          {settings?.hasPassword ? (
            <label className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[12px] text-muted-foreground">
                Remover senha (relay sem autenticação)
              </span>
              <SwitchGlass
                size="sm"
                checked={clearPassword}
                onChange={setClearPassword}
                aria-label="Remover senha do relay"
              />
            </label>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Relay ativo</p>
            <p className="text-[12px] text-muted-foreground">
              Desligado, o envio cai só no SMTP direto da conta.
            </p>
          </div>
          <SwitchGlass
            checked={enabled}
            onChange={setEnabled}
            aria-label="Relay ativo"
          />
        </div>

        {error ? (
          <p className="text-[12px] font-semibold text-destructive">{error}</p>
        ) : null}
      </form>
    </FormDialog>
  );
}
