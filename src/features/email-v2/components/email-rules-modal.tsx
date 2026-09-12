"use client";

import * as React from "react";
import { IconLoader2, IconFilter } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { updateEmailAccountOoo } from "../api/accounts";
import { useEmailRules } from "../hooks/use-email-rules";
import type {
  EmailAccount,
  EmailCustomFolder,
  EmailOooSettings,
  EmailRuleAction,
  EmailRuleField,
} from "../api/types";

const FIELD_OPTIONS: { value: EmailRuleField; label: string }[] = [
  { value: "FROM", label: "Remetente contém" },
  { value: "TO", label: "Destinatário contém" },
  { value: "SUBJECT", label: "Assunto contém" },
  { value: "BODY", label: "Corpo contém" },
  { value: "ALWAYS", label: "Qualquer mensagem recebida" },
];

const ACTION_OPTIONS: { value: EmailRuleAction; label: string }[] = [
  { value: "MOVE", label: "Mover para pasta" },
  { value: "TRASH", label: "Enviar para lixeira" },
  { value: "SPAM", label: "Mover para Spam" },
  { value: "FORWARD", label: "Encaminhar para" },
  { value: "REPLY", label: "Responder automaticamente" },
  { value: "MARK_READ", label: "Marcar como lida" },
];

type Tab = "rules" | "ooo";

type Preset = {
  id: string;
  label: string;
  field: EmailRuleField;
  action: EmailRuleAction;
};

const PRESETS: Preset[] = [
  { id: "sender-folder", label: "Mover por remetente", field: "FROM", action: "MOVE" },
  { id: "forward", label: "Encaminhar", field: "FROM", action: "FORWARD" },
  { id: "reply", label: "Resposta automática", field: "FROM", action: "REPLY" },
  { id: "spam", label: "Spam", field: "FROM", action: "SPAM" },
  { id: "trash", label: "Lixeira", field: "FROM", action: "TRASH" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: EmailAccount[];
  customFolders: EmailCustomFolder[];
  defaultAccountId?: string;
  onAccountsChange?: () => void;
}

export function EmailRulesModal({
  open,
  onOpenChange,
  accounts,
  customFolders,
  defaultAccountId,
  onAccountsChange,
}: Props) {
  const [tab, setTab] = React.useState<Tab>("rules");
  const [accountId, setAccountId] = React.useState(defaultAccountId ?? accounts[0]?.id ?? "");
  const [name, setName] = React.useState("");
  const [conditionField, setConditionField] = React.useState<EmailRuleField>("FROM");
  const [conditionValue, setConditionValue] = React.useState("");
  const [action, setAction] = React.useState<EmailRuleAction>("MOVE");
  const [targetFolderId, setTargetFolderId] = React.useState("");
  const [actionTarget, setActionTarget] = React.useState("");
  const [actionBody, setActionBody] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [oooSaving, setOooSaving] = React.useState(false);

  const selectedAccount = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const [ooo, setOoo] = React.useState<EmailOooSettings>({
    oooEnabled: false,
    oooMessage: "",
    oooStartsAt: null,
    oooEndsAt: null,
  });

  const { rules, loading, create, remove, update } = useEmailRules(accountId);

  React.useEffect(() => {
    if (defaultAccountId) setAccountId(defaultAccountId);
    else if (accounts[0]?.id) setAccountId(accounts[0].id);
  }, [defaultAccountId, accounts]);

  React.useEffect(() => {
    if (!selectedAccount) return;
    setOoo({
      oooEnabled: selectedAccount.oooEnabled ?? false,
      oooMessage: selectedAccount.oooMessage ?? "",
      oooStartsAt: selectedAccount.oooStartsAt ?? null,
      oooEndsAt: selectedAccount.oooEndsAt ?? null,
    });
  }, [selectedAccount]);

  const accountFolders = customFolders.filter((f) => f.accountId === accountId);

  React.useEffect(() => {
    if (action === "MOVE" && accountFolders.length > 0 && !targetFolderId) {
      setTargetFolderId(accountFolders[0].id);
    }
  }, [action, accountFolders, targetFolderId]);

  function applyPreset(preset: Preset) {
    setConditionField(preset.field);
    setAction(preset.action);
    if (!name.trim()) setName(preset.label);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) {
      toast.error("Selecione uma conta.");
      return;
    }
    if (conditionField !== "ALWAYS" && !conditionValue.trim()) {
      toast.error("Preencha o valor da condição.");
      return;
    }
    if (action === "MOVE" && !targetFolderId) {
      toast.error("Selecione a pasta de destino.");
      return;
    }
    if (action === "FORWARD" && !actionTarget.includes("@")) {
      toast.error("Informe o e-mail para encaminhar.");
      return;
    }
    if (action === "REPLY" && !actionBody.trim()) {
      toast.error("Escreva o texto da resposta automática.");
      return;
    }

    setSaving(true);
    try {
      await create({
        accountId,
        name: name.trim() || `Regra ${conditionValue.trim().slice(0, 24) || "geral"}`,
        conditionField,
        conditionValue: conditionValue.trim() || "*",
        action,
        targetFolderId: action === "MOVE" ? targetFolderId : null,
        actionTarget: action === "FORWARD" ? actionTarget.trim() : null,
        actionBody: action === "REPLY" ? actionBody.trim() : null,
      });
      setName("");
      setConditionValue("");
      setActionTarget("");
      setActionBody("");
      toast.success("Regra criada. Vale para as próximas mensagens sincronizadas.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar regra.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveOoo() {
    if (!accountId) return;
    setOooSaving(true);
    try {
      const saved = await updateEmailAccountOoo(accountId, {
        oooEnabled: ooo.oooEnabled,
        oooMessage: ooo.oooMessage,
        oooStartsAt: ooo.oooStartsAt,
        oooEndsAt: ooo.oooEndsAt,
      });
      setOoo(saved);
      onAccountsChange?.();
      toast.success(saved.oooEnabled ? "Ausência ativada." : "Ausência desligada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar ausência.");
    } finally {
      setOooSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={saving || oooSaving}
      size="xl"
      icon={<IconFilter size={18} stroke={2.2} className="text-[var(--brand-primary)]" />}
      title="Regras e ausência"
      description="Como no Outlook: mova, encaminhe, responda ou trate spam na sincronização. A ausência responde sozinha no período."
      footer={
        tab === "ooo" ? (
          <>
            <ButtonGlass type="button" variant="glass" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </ButtonGlass>
            <ButtonGlass type="button" variant="primary" size="sm" disabled={oooSaving} onClick={() => void handleSaveOoo()}>
              {oooSaving ? <><IconLoader2 size={14} className="animate-spin" /> Salvando…</> : "Salvar ausência"}
            </ButtonGlass>
          </>
        ) : (
          <>
            <ButtonGlass type="button" variant="glass" size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </ButtonGlass>
            <ButtonGlass type="submit" form="email-rules-form" variant="primary" size="sm" disabled={saving}>
              {saving ? <><IconLoader2 size={14} className="animate-spin" /> Salvando…</> : "Adicionar regra"}
            </ButtonGlass>
          </>
        )
      }
    >
      <div className="mb-4 flex gap-1 rounded-full bg-secondary p-1">
        <TabBtn active={tab === "rules"} onClick={() => setTab("rules")}>
          Regras
        </TabBtn>
        <TabBtn active={tab === "ooo"} onClick={() => setTab("ooo")}>
          Fora do escritório
        </TabBtn>
      </div>

      {accounts.length > 1 ? (
        <FieldRow label="Conta">
          <DropdownGlass
            options={accounts.map((a) => ({ value: a.id, label: a.email }))}
            value={accountId}
            onValueChange={setAccountId}
            matchTriggerWidth
          />
        </FieldRow>
      ) : null}

      {tab === "ooo" ? (
        <div className="flex flex-col gap-4">
          <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
            <span className="text-sm font-semibold">Ativar resposta de ausência</span>
            <Switch
              checked={ooo.oooEnabled}
              onCheckedChange={(checked) => setOoo((p) => ({ ...p, oooEnabled: checked }))}
            />
          </label>
          <FieldRow label="Mensagem">
            <textarea
              value={ooo.oooMessage ?? ""}
              onChange={(e) => setOoo((p) => ({ ...p, oooMessage: e.target.value }))}
              rows={4}
              placeholder="Estou fora do escritório e retorno em breve."
              className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 font-body text-[13px] outline-none focus:border-primary"
            />
          </FieldRow>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FieldRow label="Início (opcional)">
              <Input
                type="datetime-local"
                value={toLocalInput(ooo.oooStartsAt)}
                onChange={(e) => setOoo((p) => ({ ...p, oooStartsAt: fromLocalInput(e.target.value) }))}
                className="h-9 font-body text-[13px]"
              />
            </FieldRow>
            <FieldRow label="Fim (opcional)">
              <Input
                type="datetime-local"
                value={toLocalInput(ooo.oooEndsAt)}
                onChange={(e) => setOoo((p) => ({ ...p, oooEndsAt: fromLocalInput(e.target.value) }))}
                className="h-9 font-body text-[13px]"
              />
            </FieldRow>
          </div>
          <p className="font-body text-[12px] text-muted-foreground">
            Sem datas, a ausência vale enquanto estiver ligada. Não responde e-mails automáticos nem a própria conta.
          </p>
        </div>
      ) : (
        <form id="email-rules-form" onSubmit={handleCreate} className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-semibold transition-colors",
                  conditionField === preset.field && action === preset.action
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <FieldRow label="Nome (opcional)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Encaminhar financeiro"
              className="h-9 font-body text-[13px]"
            />
          </FieldRow>

          <FieldRow label="Quando">
            <DropdownGlass
              options={FIELD_OPTIONS}
              value={conditionField}
              onValueChange={(v) => setConditionField(v as EmailRuleField)}
              matchTriggerWidth
            />
          </FieldRow>

          {conditionField !== "ALWAYS" ? (
            <FieldRow label="Contém">
              <Input
                value={conditionValue}
                onChange={(e) => setConditionValue(e.target.value)}
                placeholder={conditionField === "FROM" ? "fornecedor@empresa.com" : "Texto ou endereço"}
                className="h-9 font-body text-[13px]"
                required
              />
            </FieldRow>
          ) : null}

          <FieldRow label="Então">
            <DropdownGlass
              options={ACTION_OPTIONS}
              value={action}
              onValueChange={(v) => setAction(v as EmailRuleAction)}
              matchTriggerWidth
            />
          </FieldRow>

          {action === "MOVE" ? (
            <FieldRow label="Pasta">
              {accountFolders.length === 0 ? (
                <p className="font-body text-[13px] text-muted-foreground">
                  Crie uma pasta na barra lateral antes de usar esta ação.
                </p>
              ) : (
                <DropdownGlass
                  options={accountFolders.map((f) => ({ value: f.id, label: f.name }))}
                  value={targetFolderId}
                  onValueChange={setTargetFolderId}
                  matchTriggerWidth
                />
              )}
            </FieldRow>
          ) : null}

          {action === "FORWARD" ? (
            <FieldRow label="Encaminhar para">
              <Input
                type="email"
                value={actionTarget}
                onChange={(e) => setActionTarget(e.target.value)}
                placeholder="copia@empresa.com"
                className="h-9 font-body text-[13px]"
                required
              />
            </FieldRow>
          ) : null}

          {action === "REPLY" ? (
            <FieldRow label="Texto da resposta">
              <textarea
                value={actionBody}
                onChange={(e) => setActionBody(e.target.value)}
                rows={3}
                placeholder="Recebemos sua mensagem e retornamos em breve."
                className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2 font-body text-[13px] outline-none focus:border-primary"
                required
              />
            </FieldRow>
          ) : null}

          <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-3">
            <p className="mb-2 font-display text-[13px] font-semibold text-[var(--text-primary)]">
              Regras ativas
            </p>
            {loading ? (
              <p className="font-body text-[13px] text-muted-foreground">Carregando…</p>
            ) : rules.length === 0 ? (
              <p className="font-body text-[13px] text-muted-foreground">
                Nenhuma regra ainda. Use um atalho acima ou monte a condição.
              </p>
            ) : (
              <ul className="space-y-2">
                {rules.map((rule) => {
                  const folderName =
                    rule.targetFolderId &&
                    accountFolders.find((f) => f.id === rule.targetFolderId)?.name;
                  const fieldLabel =
                    FIELD_OPTIONS.find((o) => o.value === rule.conditionField)?.label ??
                    rule.conditionField;
                  const actionLabel = describeAction(rule.action, folderName ?? undefined, rule.actionTarget);
                  return (
                    <li
                      key={rule.id}
                      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                          {rule.name}
                        </p>
                        <p className="font-body text-[12px] text-muted-foreground">
                          {rule.conditionField === "ALWAYS"
                            ? "Qualquer mensagem"
                            : `${fieldLabel} “${rule.conditionValue}”`}{" "}
                          → {actionLabel}
                        </p>
                      </div>
                      <Switch
                        checked={rule.isActive}
                        onCheckedChange={(checked) =>
                          void update(rule.id, { isActive: checked }).catch(() =>
                            toast.error("Erro ao atualizar regra."),
                          )
                        }
                        aria-label={`Ativar regra ${rule.name}`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          void remove(rule.id)
                            .then(() => toast.success("Regra removida."))
                            .catch(() => toast.error("Erro ao remover regra."))
                        }
                        className="rounded-[var(--radius-sm)] p-1 text-muted-foreground hover:bg-[var(--glass-bg-strong)] hover:text-destructive"
                        aria-label={`Remover regra ${rule.name}`}
                      >
                        Remover
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </form>
      )}
    </FormDialog>
  );
}

function describeAction(action: EmailRuleAction, folderName: string | undefined, target: string | null) {
  if (action === "TRASH") return "Lixeira";
  if (action === "SPAM") return "Spam";
  if (action === "FORWARD") return `Encaminhar para ${target || "…"}`;
  if (action === "REPLY") return "Resposta automática";
  if (action === "MARK_READ") return "Marcar como lida";
  return folderName ?? "Pasta";
}

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
        active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="font-display text-[12px] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
