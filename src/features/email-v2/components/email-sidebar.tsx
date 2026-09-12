"use client";

import * as React from "react";
import { toast } from "sonner";

import { DropdownGlass } from "@/components/crm/dropdown-glass";

import type {
  EmailAccount,
  EmailCustomFolder,
  EmailFolder,
} from "../api/types";

const IcoInbox = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>
  </svg>
);
const IcoSent = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>
  </svg>
);
const IcoTrash = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>
  </svg>
);
const IcoFolder = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>
  </svg>
);
const IcoPlus = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 5v14M5 12h14"/>
  </svg>
);
const IcoX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const SYSTEM_FOLDERS: { key: EmailFolder; label: string; icon: React.ReactNode }[] = [
  { key: "INBOX", label: "Caixa de entrada", icon: <IcoInbox /> },
  { key: "SENT", label: "Enviados", icon: <IcoSent /> },
  { key: "TRASH", label: "Excluídos", icon: <IcoTrash /> },
];

interface Props {
  accounts: EmailAccount[];
  loading: boolean;
  customFolders: EmailCustomFolder[];
  selectedAccountId: string | undefined;
  selectedFolder: EmailFolder;
  selectedCustomFolderId: string | null;
  onSelectAccount: (id: string | undefined) => void;
  onSelectFolder: (folder: EmailFolder) => void;
  onSelectCustomFolder: (folderId: string) => void;
  onCreateCustomFolder: (accountId: string, name: string) => Promise<void> | void;
  onDeleteCustomFolder: (folderId: string) => Promise<void> | void;
  onDropToSystemFolder?: (emailId: string, folder: EmailFolder) => void;
  onDropToCustomFolder?: (emailId: string, folderId: string) => void;
}

const DRAG_MIME = "application/x-email-id";
const ALL_ACCOUNTS = "__all__";

function folderUnreadFor(account: EmailAccount, folder: EmailFolder): number {
  const counts = account.folderUnread;
  if (!counts) return folder === "INBOX" ? account.unreadCount : 0;
  if (folder === "INBOX") return counts.inbox;
  if (folder === "SENT") return counts.sent;
  return counts.trash;
}

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="shrink-0 rounded-full bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] px-2 py-0.5 font-display text-[10px] font-bold text-[var(--brand-primary-dark,var(--brand-primary))]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function readEmailId(e: React.DragEvent): string | null {
  return e.dataTransfer.getData(DRAG_MIME) || null;
}

export function EmailSidebar({
  accounts,
  loading,
  customFolders,
  selectedAccountId,
  selectedFolder,
  selectedCustomFolderId,
  onSelectAccount,
  onSelectFolder,
  onSelectCustomFolder,
  onCreateCustomFolder,
  onDeleteCustomFolder,
  onDropToSystemFolder,
  onDropToCustomFolder,
}: Props) {
  const [hoveredFolder, setHoveredFolder] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);

  const visibleCustom = selectedAccountId
    ? customFolders.filter((f) => f.accountId === selectedAccountId)
    : customFolders;

  const systemUnread = (folder: EmailFolder) => {
    const list = selectedAccountId
      ? accounts.filter((a) => a.id === selectedAccountId)
      : accounts;
    const base = list.reduce((s, a) => s + folderUnreadFor(a, folder), 0);
    if (folder === "INBOX" && !selectedAccountId) {
      return base + customFolders.reduce((s, f) => s + f.unreadCount, 0);
    }
    return base;
  };

  function dropHandlers(key: string, onDrop: (emailId: string) => void) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropTarget((curr) => (curr === key ? null : curr));
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = readEmailId(e);
        setDropTarget(null);
        if (id) onDrop(id);
      },
    };
  }

  const activeAccount = accounts.find((a) => a.id === selectedAccountId);

  return (
    <div className="flex h-full flex-col overflow-y-auto p-3">
      <div className="mb-3">
        <p className="mb-1.5 px-0.5 font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Conta
        </p>
        <DropdownGlass
          options={[
            { value: ALL_ACCOUNTS, label: "Todas as contas", description: "Caixa combinada" },
            ...accounts.map((a) => ({
              value: a.id,
              label: a.email,
              description: a.visibility === "PERSONAL" ? "Pessoal" : "Compartilhado",
            })),
          ]}
          value={selectedAccountId ?? ALL_ACCOUNTS}
          onValueChange={(v) => onSelectAccount(v === ALL_ACCOUNTS ? undefined : v)}
          matchTriggerWidth
          disabled={loading || accounts.length === 0}
        />
        {activeAccount ? (
          <p className="mt-1.5 truncate px-0.5 font-body text-[11px] text-[var(--text-muted)]">
            {activeAccount.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5">
        {SYSTEM_FOLDERS.map((f) => {
          const active = !selectedCustomFolderId && selectedFolder === f.key;
          const canDrop = f.key !== "SENT" && !!onDropToSystemFolder;
          const dropKey = `sys:${f.key}`;
          const isDropOver = dropTarget === dropKey;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onSelectFolder(f.key)}
              {...(canDrop ? dropHandlers(dropKey, (emailId) => onDropToSystemFolder!(emailId, f.key)) : {})}
              className={[
                "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 font-display text-[12.5px] font-semibold transition-colors",
                isDropOver
                  ? "bg-[var(--brand-primary)] text-white ring-2 ring-[var(--brand-primary)]/40"
                  : active
                    ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary-dark,var(--brand-primary))]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
              ].join(" ")}
            >
              <span className="shrink-0">{f.icon}</span>
              <span className="flex-1 text-left">{f.label}</span>
              <UnreadBadge count={systemUnread(f.key)} />
            </button>
          );
        })}
      </div>

      <div className="mt-3 border-t border-[var(--glass-border-subtle,var(--glass-border))] pt-2">
        <p className="mb-1 px-2 font-display text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          Pastas
        </p>
        {visibleCustom.map((cf) => {
          const active = selectedCustomFolderId === cf.id;
          const dropKey = `cust:${cf.id}`;
          const isDropOver = dropTarget === dropKey;
          return (
            <div
              key={cf.id}
              className="group relative"
              onMouseEnter={() => setHoveredFolder(cf.id)}
              onMouseLeave={() => setHoveredFolder(null)}
            >
              <button
                type="button"
                onClick={() => {
                  onSelectAccount(cf.accountId);
                  onSelectCustomFolder(cf.id);
                }}
                {...(onDropToCustomFolder
                  ? dropHandlers(dropKey, (emailId) => onDropToCustomFolder(emailId, cf.id))
                  : {})}
                className={[
                  "flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 font-display text-[12.5px] font-semibold transition-colors",
                  isDropOver
                    ? "bg-[var(--brand-primary)] text-white ring-2 ring-[var(--brand-primary)]/40"
                    : active
                      ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary-dark,var(--brand-primary))]"
                      : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
                ].join(" ")}
              >
                <span className="shrink-0"><IcoFolder /></span>
                <span className="min-w-0 flex-1 truncate text-left">{cf.name}</span>
                <UnreadBadge count={cf.unreadCount} />
              </button>
              {hoveredFolder === cf.id ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void onDeleteCustomFolder(cf.id);
                  }}
                  className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-destructive"
                  title="Remover pasta"
                >
                  <IcoX />
                </button>
              ) : null}
            </div>
          );
        })}

        <NewFolderInput
          disabled={!selectedAccountId && accounts.length !== 1}
          onCreate={(name) => {
            const accountId = selectedAccountId ?? accounts[0]?.id;
            if (!accountId) {
              toast.error("Selecione uma conta para criar a pasta.");
              return;
            }
            return onCreateCustomFolder(accountId, name);
          }}
        />
      </div>
    </div>
  );
}

function NewFolderInput({
  onCreate,
  disabled,
}: {
  onCreate: (name: string) => Promise<void> | void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function submit() {
    const name = value.trim();
    if (!name) {
      setEditing(false);
      setValue("");
      return;
    }
    setSubmitting(true);
    try {
      await onCreate(name);
      setValue("");
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar pasta.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setEditing(true)}
        className="mt-0.5 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 font-display text-[12px] font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)] disabled:opacity-40"
      >
        <IcoPlus />
        <span>Nova pasta</span>
      </button>
    );
  }

  return (
    <div className="flex w-full items-center gap-1 px-2 py-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") {
            setEditing(false);
            setValue("");
          }
        }}
        onBlur={() => void submit()}
        disabled={submitting}
        placeholder="Nome da pasta"
        className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-2 py-1 font-display text-[12.5px] font-semibold focus:border-[var(--brand-primary)] focus:outline-none"
      />
    </div>
  );
}
