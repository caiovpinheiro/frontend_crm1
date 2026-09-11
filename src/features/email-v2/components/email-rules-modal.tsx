"use client";

import * as React from "react";
import {
  IconLoader2,
  IconSend,
  IconTrash,
  IconFilter,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { useEmailRules } from "../hooks/use-email-rules";
import type {
  EmailAccount,
  EmailCustomFolder,
  EmailRuleAction,
  EmailRuleField,
} from "../api/types";

const FIELD_OPTIONS = [
  { value: "FROM", label: "Remetente contém" },
  { value: "TO", label: "Destinatário contém" },
  { value: "SUBJECT", label: "Assunto contém" },
];

const ACTION_OPTIONS = [
  { value: "MOVE", label: "Mover para pasta" },
  { value: "TRASH", label: "Enviar para lixeira" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: EmailAccount[];
  customFolders: EmailCustomFolder[];
  defaultAccountId?: string;
}

export function EmailRulesModal({
  open,
  onOpenChange,
  accounts,
  customFolders,
  defaultAccountId,
}: Props) {
  const [accountId, setAccountId] = React.useState(
    defaultAccountId ?? accounts[0]?.id ?? "",
  );
  const [name, setName] = React.useState("");
  const [conditionField, setConditionField] = React.useState<EmailRuleField>("FROM");
  const [conditionValue, setConditionValue] = React.useState("");
  const [action, setAction] = React.useState<EmailRuleAction>("MOVE");
  const [targetFolderId, setTargetFolderId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const { rules, loading, create, remove, update } = useEmailRules(accountId);

  React.useEffect(() => {
    if (defaultAccountId) setAccountId(defaultAccountId);
    else if (accounts[0]?.id) setAccountId(accounts[0].id);
  }, [defaultAccountId, accounts]);

  const accountFolders = customFolders.filter((f) => f.accountId === accountId);

  React.useEffect(() => {
    if (action === "MOVE" && accountFolders.length > 0 && !targetFolderId) {
      setTargetFolderId(accountFolders[0].id);
    }
  }, [action, accountFolders, targetFolderId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !conditionValue.trim()) {
      toast.error("Preencha o valor da condição.");
      return;
    }
    if (action === "MOVE" && !targetFolderId) {
      toast.error("Selecione a pasta de destino.");
      return;
    }

    setSaving(true);
    try {
      await create({
        accountId,
        name: name.trim() || `Regra ${conditionValue.trim().slice(0, 24)}`,
        conditionField,
        conditionValue: conditionValue.trim(),
        action,
        targetFolderId: action === "MOVE" ? targetFolderId : null,
      });
      setName("");
      setConditionValue("");
      toast.success("Regra criada.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar regra.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={saving}
      size="lg"
      icon={<IconFilter size={18} stroke={2.2} className="text-[var(--brand-primary)]" />}
      title="Regras de e-mail"
      description="Quando um e-mail recebido corresponder à condição, aplique a ação automaticamente na sincronização."
      footer={
        <>
          <ButtonGlass type="button" variant="glass" size="sm" onClick={() => onOpenChange(false)}>Fechar</ButtonGlass>
          <ButtonGlass type="submit" form="email-rules-form" variant="primary" size="sm" disabled={saving}>
            {saving ? <><IconLoader2 size={14} className="animate-spin" /> Salvando…</> : "Adicionar regra"}
          </ButtonGlass>
        </>
      }
    >
      <form id="email-rules-form" onSubmit={handleCreate} className="flex flex-col gap-4">
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

          <FieldRow label="Nome (opcional)">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Clientes VIP"
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

          <FieldRow label="Contém">
            <Input
              value={conditionValue}
              onChange={(e) => setConditionValue(e.target.value)}
              placeholder="Texto ou endereço de e-mail"
              className="h-9 font-body text-[13px]"
              required
            />
          </FieldRow>

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
                <p className="font-body text-[13px] text-[var(--text-muted)]">
                  Crie uma pasta em Organizar pastas antes de usar esta ação.
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

          <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] p-3">
            <p className="mb-2 font-display text-[13px] font-semibold text-[var(--text-primary)]">
              Regras ativas
            </p>
            {loading ? (
              <p className="font-body text-[13px] text-[var(--text-muted)]">Carregando…</p>
            ) : rules.length === 0 ? (
              <p className="font-body text-[13px] text-[var(--text-muted)]">
                Nenhuma regra ainda.
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
                  return (
                    <li
                      key={rule.id}
                      className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-overlay)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                          {rule.name}
                        </p>
                        <p className="font-body text-[12px] text-[var(--text-muted)]">
                          {fieldLabel} “{rule.conditionValue}” →{" "}
                          {rule.action === "TRASH"
                            ? "Lixeira"
                            : folderName ?? "Pasta"}
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
                        className="rounded-[var(--radius-sm)] p-1 text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-destructive"
                        aria-label={`Remover regra ${rule.name}`}
                      >
                        <IconTrash size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
      </form>
    </FormDialog>
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
      <span className="font-display text-[12px] font-semibold text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}
