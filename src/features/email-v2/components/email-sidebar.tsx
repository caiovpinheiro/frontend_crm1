"use client";

import * as React from "react";
import { toast } from "sonner";
import type {
  EmailAccount,
  EmailCustomFolder,
  EmailFolder,
} from "../api/types";

// SVG icons matching DS v2 reference
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
const IcoChevron = ({ open }: { open: boolean }) => (
  <svg
    width="13" height="13" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}
  >
    <path d="m9 18 6-6-6-6"/>
  </svg>
);
const IcoRefresh = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9a8 8 0 0 1 13-3l2 2M21 4v4h-4"/><path d="M21 15a8 8 0 0 1-13 3l-2-2M3 20v-4h4"/>
  </svg>
);
const IcoX = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);

const SYSTEM_FOLDERS: { key: EmailFolder; label: string; icon: React.ReactNode }[] = [
  { key: "INBOX", label: "Caixa de entrada", icon: <IcoInbox /> },
  { key: "SENT",  label: "Enviados",         icon: <IcoSent /> },
  { key: "TRASH", label: "Excluídos",        icon: <IcoTrash /> },
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
  onSync: (id: string) => void;
  onCreateCustomFolder: (accountId: string, name: string) => Promise<void> | void;
  onRenameCustomFolder?: (folderId: string, name: string) => Promise<void> | void;
  onDeleteCustomFolder: (folderId: string) => Promise<void> | void;
  onManageFolders?: () => void;
  /** Drop de uma mensagem em pasta de sistema (INBOX/TRASH). */
  onDropToSystemFolder?: (emailId: string, folder: EmailFolder) => void;
  /** Drop de uma mensagem em pasta custom. */
  onDropToCustomFolder?: (emailId: string, folderId: string) => void;
}

const DRAG_MIME = "application/x-email-id";

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

/** Hook util: extrai email id de um DragEvent (HTML5 DnD). */
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
  onSync,
  onCreateCustomFolder,
  onRenameCustomFolder,
  onDeleteCustomFolder,
  onManageFolders,
  onDropToSystemFolder,
  onDropToCustomFolder,
}: Props) {
  const [syncing, setSyncing] = React.useState<string | null>(null);
  const [hoveredFolder, setHoveredFolder] = React.useState<string | null>(null);
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [renamingId, setRenamingId] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState("");
  const didExpandAll = React.useRef(false);

  const totalUnread =
    accounts.reduce((s, a) => s + folderUnreadFor(a, "INBOX"), 0) +
    customFolders.reduce((s, f) => s + f.unreadCount, 0);
  const inboxAll = !selectedAccountId && selectedFolder === "INBOX" && !selectedCustomFolderId;

  React.useEffect(() => {
    if (didExpandAll.current || accounts.length === 0) return;
    didExpandAll.current = true;
    setExpanded(new Set(accounts.map((a) => a.id)));
  }, [accounts]);

  // Auto-expande a conta ativa para que pastas/custom fiquem visíveis
  React.useEffect(() => {
    if (selectedAccountId) {
      setExpanded((prev) => {
        if (prev.has(selectedAccountId)) return prev;
        const next = new Set(prev);
        next.add(selectedAccountId);
        return next;
      });
    }
  }, [selectedAccountId]);

  function toggle(accountId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  }

  async function handleSync(id: string) {
    setSyncing(id);
    try { await onSync(id); } finally { setSyncing(null); }
  }

  // ── Helpers de drag-and-drop ─────────────────────────────────────────────
  function dropHandlers(key: string, onDrop: (emailId: string) => void) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (dropTarget !== key) setDropTarget(key);
      },
      onDragLeave: (e: React.DragEvent) => {
        // só limpa se o cursor saiu do elemento (não do filho)
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

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3">

      {/* ── Caixa combinada (atalho global) ───────────────────────────── */}
      <button
        onClick={() => { onSelectAccount(undefined); onSelectFolder("INBOX"); }}
        className={[
          "flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--radius-md)] transition-colors mb-2 text-left",
          inboxAll
            ? "bg-[var(--glass-bg-modal)] shadow-[0_1px_6px_rgba(100,130,180,0.10)] border border-[var(--glass-border)]"
            : "hover:bg-[var(--glass-bg-overlay)]",
        ].join(" ")}
      >
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--brand-primary)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shrink-0">
          <IcoInbox />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold font-display text-[var(--text-primary)] truncate leading-tight">
            Caixa de entrada
          </p>
          <p className="text-[11px] text-[var(--text-muted)] leading-tight">
            Todas as contas
          </p>
        </div>
        {totalUnread > 0 && <UnreadBadge count={totalUnread} />}
      </button>

      {loading && (
        <p className="text-[11px] text-[var(--text-muted)] px-2.5 py-1">
          Carregando contas…
        </p>
      )}

      {/* ── Contas individuais com pastas aninhadas ───────────────────── */}
      {accounts.map((acc) => {
        const isOpen = expanded.has(acc.id);
        const isSelected = selectedAccountId === acc.id;
        const acctCustomFolders = customFolders.filter((f) => f.accountId === acc.id);

        return (
          <div key={acc.id} className="mb-1">
            {/* Header da conta — clicar abre INBOX dela; chevron expande pastas */}
            <div
              className={[
                "flex items-center gap-2 w-full pl-1 pr-1 py-1.5 rounded-[var(--radius-md)] transition-colors",
                isSelected && !selectedCustomFolderId
                  ? "bg-[var(--glass-bg-modal)] shadow-[0_1px_6px_rgba(100,130,180,0.10)] border border-[var(--glass-border)]"
                  : "hover:bg-[var(--glass-bg-overlay)]",
              ].join(" ")}
            >
              <button
                onClick={() => toggle(acc.id)}
                className="w-5 h-5 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] shrink-0"
                aria-label={isOpen ? "Recolher" : "Expandir"}
              >
                <IcoChevron open={isOpen} />
              </button>

              <button
                onClick={() => { onSelectAccount(acc.id); onSelectFolder("INBOX"); }}
                className="flex items-center gap-2 flex-1 min-w-0 text-left"
              >
                <span className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--brand-primary)] text-white font-bold text-[12px] font-display shrink-0">
                  {acc.email[0]?.toUpperCase()}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold font-display text-[var(--text-primary)] truncate leading-tight">
                    {acc.email}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                    {acc.visibility === "PERSONAL" ? "Pessoal" : "Compartilhado"}
                  </p>
                </div>
              </button>

              <button
                onClick={() => void handleSync(acc.id)}
                className="w-[24px] h-[24px] rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)] transition-colors shrink-0"
                title="Sincronizar"
              >
                <span className={syncing === acc.id ? "animate-spin inline-flex" : "inline-flex"}>
                  <IcoRefresh />
                </span>
              </button>

              {(() => {
                const accountUnread =
                  folderUnreadFor(acc, "INBOX") +
                  acctCustomFolders.reduce((s, f) => s + f.unreadCount, 0);
                return accountUnread > 0 ? <UnreadBadge count={accountUnread} /> : null;
              })()}
            </div>

            {/* Pastas aninhadas */}
            {isOpen && (
              <div className="ml-7 mt-0.5 flex flex-col gap-0.5">
                {SYSTEM_FOLDERS.map((f) => {
                  const active = isSelected && !selectedCustomFolderId && selectedFolder === f.key;
                  // SENT não recebe drop (não faz sentido mover mensagens para "Enviados")
                  const canDrop = f.key !== "SENT" && !!onDropToSystemFolder;
                  const dropKey = `sys:${acc.id}:${f.key}`;
                  const isDropOver = dropTarget === dropKey;
                  return (
                    <button
                      key={f.key}
                      onClick={() => { onSelectAccount(acc.id); onSelectFolder(f.key); }}
                      {...(canDrop ? dropHandlers(dropKey, (emailId) => onDropToSystemFolder!(emailId, f.key)) : {})}
                      className={[
                        "flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-sm)] transition-colors text-[12.5px] font-semibold font-display",
                        isDropOver
                          ? "bg-[var(--brand-primary)] text-white ring-2 ring-[var(--brand-primary)]/40"
                          : active
                            ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary-dark,var(--brand-primary))]"
                            : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
                      ].join(" ")}
                    >
                      <span className="shrink-0">{f.icon}</span>
                      <span className="flex-1 text-left">{f.label}</span>
                      <UnreadBadge count={folderUnreadFor(acc, f.key)} />
                    </button>
                  );
                })}

                {/* Pastas customizadas dessa conta */}
                {acctCustomFolders.map((cf) => {
                  const active = isSelected && selectedCustomFolderId === cf.id;
                  const dropKey = `cust:${cf.id}`;
                  const isDropOver = dropTarget === dropKey;
                  const renaming = renamingId === cf.id;
                  return (
                    <div
                      key={cf.id}
                      className="relative group"
                      onMouseEnter={() => setHoveredFolder(cf.id)}
                      onMouseLeave={() => setHoveredFolder(null)}
                    >
                      {renaming ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = renameValue.trim();
                              setRenamingId(null);
                              if (next && next !== cf.name) void onRenameCustomFolder?.(cf.id, next);
                            }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onBlur={() => {
                            const next = renameValue.trim();
                            setRenamingId(null);
                            if (next && next !== cf.name) void onRenameCustomFolder?.(cf.id, next);
                          }}
                          className="w-full px-2 py-1.5 text-[12.5px] font-semibold font-display rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] focus:outline-none focus:border-[var(--brand-primary)]"
                        />
                      ) : (
                        <button
                          onClick={() => { onSelectAccount(acc.id); onSelectCustomFolder(cf.id); }}
                          {...(onDropToCustomFolder
                            ? dropHandlers(dropKey, (emailId) => onDropToCustomFolder(emailId, cf.id))
                            : {})}
                          className={[
                            "flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-sm)] transition-colors text-[12.5px] font-semibold font-display",
                            isDropOver
                              ? "bg-[var(--brand-primary)] text-white ring-2 ring-[var(--brand-primary)]/40"
                              : active
                                ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.15))] text-[var(--brand-primary-dark,var(--brand-primary))]"
                                : "text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]",
                          ].join(" ")}
                        >
                          <span className="shrink-0"><IcoFolder /></span>
                          <span className="flex-1 text-left truncate">{cf.name}</span>
                          <UnreadBadge count={cf.unreadCount} />
                        </button>
                      )}
                      {hoveredFolder === cf.id && !renaming && (
                        <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                          {onRenameCustomFolder ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(cf.id);
                                setRenameValue(cf.name);
                              }}
                              className="w-[20px] h-[20px] rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--brand-primary)] transition-colors"
                              title="Renomear pasta"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                              </svg>
                            </button>
                          ) : null}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void onDeleteCustomFolder(cf.id);
                            }}
                            className="w-[20px] h-[20px] rounded-[var(--radius-sm)] flex items-center justify-center text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-destructive transition-colors"
                            title="Remover pasta"
                          >
                            <IcoX />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Criar nova pasta */}
                <NewFolderInput
                  onCreate={(name) => onCreateCustomFolder(acc.id, name)}
                />
              </div>
            )}
          </div>
        );
      })}

      {onManageFolders && accounts.length > 0 ? (
        <button
          type="button"
          onClick={onManageFolders}
          className="mt-2 flex items-center gap-2 w-full px-2.5 py-2 rounded-[var(--radius-md)] transition-colors text-[12.5px] font-semibold font-display text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
        >
          <IcoFolder />
          <span>Organizar pastas</span>
        </button>
      ) : null}
    </div>
  );
}

// ── Input inline para criar pasta ─────────────────────────────────────────────
function NewFolderInput({ onCreate }: { onCreate: (name: string) => Promise<void> | void }) {
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
        onClick={() => setEditing(true)}
        className="flex items-center gap-2 w-full px-2 py-1.5 rounded-[var(--radius-sm)] transition-colors text-[12px] font-semibold font-display text-[var(--text-muted)] hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--brand-primary)]"
      >
        <IcoPlus />
        <span>Nova pasta</span>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 w-full px-2 py-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit();
          if (e.key === "Escape") { setEditing(false); setValue(""); }
        }}
        onBlur={() => void submit()}
        disabled={submitting}
        placeholder="Nome da pasta"
        className="flex-1 min-w-0 px-2 py-1 text-[12.5px] font-semibold font-display rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] focus:outline-none focus:border-[var(--brand-primary)]"
      />
    </div>
  );
}
