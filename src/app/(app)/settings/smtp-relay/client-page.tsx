"use client";

import * as React from "react";
import {
  IconAlertTriangle,
  IconMailForward,
  IconPencil,
  IconPlus,
  IconShieldLock,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { AppLoading } from "@/components/crm/app-loading";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { SwitchGlass } from "@/components/crm/switch-glass";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { RelayFormDialog } from "@/features/smtp-relay-v2/components/relay-form-dialog";
import { useSmtpRelay } from "@/features/smtp-relay-v2/hooks";
import { cn } from "@/lib/utils";
import { SETTINGS_HUB_BACK, SettingsV2Shell } from "../_v2-shell";

export default function SmtpRelayClientPage() {
  return (
    <SettingsV2Shell
      back={SETTINGS_HUB_BACK}
      title="Relay SMTP"
      description="Smarthost de saída quando o SMTP direto está bloqueado"
      icon={<IconMailForward size={22} />}
    >
      <SmtpRelayBody />
    </SettingsV2Shell>
  );
}

function SmtpRelayBody() {
  const { settings, isLoading, error, save, remove } = useSmtpRelay();
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  async function handleToggleEnabled(next: boolean) {
    if (!settings?.configured) return;
    try {
      await save.mutateAsync({
        host: settings.host,
        port: settings.port,
        secure: settings.secure,
        username: settings.username,
        enabled: next,
      });
      toast.success(next ? "Relay ativado." : "Relay desativado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao atualizar o relay.");
    }
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Remover relay SMTP?",
      description:
        "O envio de e-mails volta a depender só do SMTP direto de cada conta. Se a sua rede bloqueia 465/587, os envios podem falhar.",
      confirmLabel: "Remover",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync();
      toast.success("Relay removido.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao remover o relay.");
    }
  }

  if (isLoading) {
    return <AppLoading variant="inline" className="min-h-0 flex-1" />;
  }

  if (error) {
    return (
      <div className={cn(CARD_SURFACE_CLASS, "flex flex-col items-center gap-2 py-12")}>
        <IconAlertTriangle size={28} className="text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  const configured = settings?.configured === true;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3.5">
      {configured && settings ? (
        <div className={cn(CARD_SURFACE_CLASS, "flex flex-col gap-4 p-4 sm:p-5")}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <IconMailForward size={18} />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-display text-[15px] font-bold text-foreground">
                {settings.host}:{settings.port}
              </p>
              <p className="text-[12px] text-muted-foreground">
                {settings.username ? `Usuário: ${settings.username}` : "Sem autenticação (liberação por IP)"}
              </p>
            </div>
            <SwitchGlass
              checked={settings.enabled}
              onChange={(next) => void handleToggleEnabled(next)}
              disabled={save.isPending}
              aria-label={settings.enabled ? "Desativar relay" : "Ativar relay"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={settings.enabled ? "success" : "muted"}>
              {settings.enabled ? "Ativo" : "Desativado"}
            </Badge>
            <Badge tone="muted">{settings.secure ? "SSL/TLS implícito" : "STARTTLS / plano"}</Badge>
            <Badge tone="muted">
              {settings.hasPassword ? "Com senha" : "Sem senha"}
            </Badge>
            {settings.updatedAt ? (
              <span className="text-[12px] text-muted-foreground">
                Atualizado em {new Date(settings.updatedAt).toLocaleString("pt-BR")}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => void handleRemove()}
              disabled={remove.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[12px] font-semibold text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <IconTrash size={14} /> Remover
            </button>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-[12px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <IconPencil size={14} /> Editar relay
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card py-16">
          <IconMailForward size={40} className="text-muted-foreground opacity-40" />
          <p className="max-w-md text-center text-sm text-muted-foreground">
            Nenhum relay configurado. Se a sua rede bloqueia as portas 465/587 de saída,
            configure aqui o smarthost autorizado pelo seu domínio.
          </p>
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-display text-[13px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <IconPlus size={15} /> Configurar relay
          </button>
        </div>
      )}

      <div className={cn(CARD_SURFACE_CLASS, "flex items-start gap-3 p-4")}>
        <IconShieldLock size={18} className="mt-0.5 shrink-0 text-primary" />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          O relay é usado só quando a <strong className="text-foreground">conexão</strong> com o
          SMTP da conta falha (erro de senha nunca passa pelo relay). O remetente continua sendo
          o e-mail da caixa conectada — por isso o relay precisa ser um{" "}
          <strong className="text-foreground">smarthost autorizado a enviar pelo seu domínio</strong>{" "}
          (o SMTP da sua empresa ou um serviço com o domínio verificado). Não use a conta
          transacional do CRM: o SPF/DKIM quebraria. A senha fica criptografada no banco.
        </p>
      </div>

      <RelayFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        settings={settings}
        onSave={async (input) => {
          await save.mutateAsync(input);
          toast.success("Relay salvo.");
        }}
      />

      {confirmDialog}
    </div>
  );
}

function Badge({ tone, children }: { tone: "success" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[11px] font-bold",
        tone === "success" ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
