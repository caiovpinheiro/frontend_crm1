"use client";

import * as React from "react";
import { IconFolder, IconLoader2, IconPencil, IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { FormDialog, formControlClass, formLabelClass } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";

import type { EmailAccount, EmailCustomFolder } from "../api/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: EmailAccount[];
  folders: EmailCustomFolder[];
  defaultAccountId?: string;
  onCreate: (accountId: string, name: string) => Promise<void> | void;
  onRename: (folderId: string, name: string) => Promise<void> | void;
  onDelete: (folderId: string) => Promise<void> | void;
}

export function EmailFoldersModal({
  open,
  onOpenChange,
  accounts,
  folders,
  defaultAccountId,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [accountId, setAccountId] = React.useState(
    defaultAccountId ?? accounts[0]?.id ?? "",
  );
  const [name, setName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    if (defaultAccountId) setAccountId(defaultAccountId);
    else if (accounts[0]?.id) setAccountId(accounts[0].id);
    setName("");
    setEditingId(null);
  }, [open, defaultAccountId, accounts]);

  const accountFolders = folders.filter((f) => f.accountId === accountId);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!accountId) {
      toast.error("Selecione uma conta.");
      return;
    }
    if (!trimmed) {
      toast.error("Informe o nome da pasta.");
      return;
    }
    setSaving(true);
    try {
      await onCreate(accountId, trimmed);
      setName("");
      toast.success("Pasta criada.");
    } catch {
      /* toast no page-level */
    } finally {
      setSaving(false);
    }
  }

  async function handleRename(folderId: string) {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    try {
      await onRename(folderId, trimmed);
      toast.success("Pasta renomeada.");
      setEditingId(null);
    } catch {
      /* toast no page-level */
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={saving}
      size="lg"
      icon={<IconFolder size={18} stroke={2.2} className="text-[var(--brand-primary)]" />}
      title="Organizar pastas"
      description="Crie, renomeie ou remova pastas para classificar os e-mails desta conta."
      footer={
        <>
          <ButtonGlass type="button" variant="glass" size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </ButtonGlass>
          <ButtonGlass type="submit" form="email-folders-form" variant="primary" size="sm" disabled={saving || accounts.length === 0}>
            {saving ? (
              <>
                <IconLoader2 size={14} className="animate-spin" /> Salvando…
              </>
            ) : (
              "Criar pasta"
            )}
          </ButtonGlass>
        </>
      }
    >
      <form id="email-folders-form" onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4">
        {accounts.length > 1 ? (
          <label className="block">
            <span className={formLabelClass}>Conta</span>
            <DropdownGlass
              options={accounts.map((a) => ({ value: a.id, label: a.email }))}
              value={accountId}
              onValueChange={setAccountId}
              matchTriggerWidth
            />
          </label>
        ) : null}

        <label className="block">
          <span className={formLabelClass}>Nova pasta</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Financeiro, Clientes, RH"
            className={`${formControlClass} h-9 font-body text-[13px]`}
          />
        </label>

        <div className="rounded-xl border border-border bg-card p-3">
          <p className="mb-2 font-display text-[13px] font-semibold text-foreground">
            Pastas desta conta
          </p>
          {accountFolders.length === 0 ? (
            <p className="font-body text-[13px] text-muted-foreground">
              Nenhuma pasta ainda. Crie uma para organizar a caixa.
            </p>
          ) : (
            <ul className="space-y-2">
              {accountFolders.map((folder) => (
                <li
                  key={folder.id}
                  className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2"
                >
                  <IconFolder size={15} className="shrink-0 text-muted-foreground" />
                  {editingId === folder.id ? (
                    <Input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleRename(folder.id);
                        }
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => void handleRename(folder.id)}
                      className="h-8 flex-1 font-body text-[13px]"
                    />
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[13px] font-semibold text-foreground">
                        {folder.name}
                      </p>
                      <p className="font-body text-[12px] text-muted-foreground">
                        {folder.unreadCount} não lido{folder.unreadCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                  )}
                  {editingId !== folder.id ? (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(folder.id);
                        setEditingName(folder.name);
                      }}
                      className="rounded-[var(--radius-sm)] p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={`Renomear pasta ${folder.name}`}
                    >
                      <IconPencil size={15} />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void onDelete(folder.id)}
                    className="rounded-[var(--radius-sm)] p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                    aria-label={`Remover pasta ${folder.name}`}
                  >
                    <IconTrash size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </form>
    </FormDialog>
  );
}
