"use client";

import * as React from "react";
import { IconUser } from "@tabler/icons-react";
import type { EmailCustomFolder, EmailFolder, EmailListItem } from "../api/types";
import { CheckboxGlass } from "@/components/crm/checkbox-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { IdentityAvatar } from "@/components/crm/identity-avatar";
import { FOLDER_TONE, resolveFolderTone } from "../lib/folder-colors";
import { formatRelativeDate } from "../utils";
import { decodeIfQuotedPrintable } from "./html-email-frame";
import { cn } from "@/lib/utils";

const IcoMailEmpty = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-30">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>
  </svg>
);

const IcoTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>
  </svg>
);

const IcoUndo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 1 1 0 10h-3"/>
  </svg>
);

interface Props {
  emails: EmailListItem[];
  loading: boolean;
  selectedId: string | null;
  folder: EmailFolder;
  showAccountTag: boolean;
  accountEmails: Record<string, string>;
  customFolders?: EmailCustomFolder[];
  onSelect: (id: string) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
  /** Move o e-mail para uma pasta custom (drag-drop ou menu de contexto). */
  onMoveToCustomFolder?: (emailId: string, folderId: string) => void;
  /** Tira o e-mail de qualquer pasta custom (volta pra INBOX). */
  onRemoveFromCustomFolder?: (emailId: string) => void;
  /** Marca como lido/não lido pelo menu de contexto. */
  onToggleRead?: (emailId: string, isRead: boolean) => void;
  onBulkMove?: (ids: string[], folderId: string) => void | Promise<void>;
  onBulkInbox?: (ids: string[]) => void | Promise<void>;
  onBulkTrash?: (ids: string[]) => void | Promise<void>;
  bulkBusy?: boolean;
}

export function EmailList({
  emails,
  loading,
  selectedId,
  folder,
  showAccountTag,
  accountEmails,
  customFolders = [],
  onSelect,
  onTrash,
  onRestore,
  onDeletePermanent,
  onMoveToCustomFolder,
  onRemoveFromCustomFolder,
  onToggleRead,
  onBulkMove,
  onBulkInbox,
  onBulkTrash,
  bulkBusy = false,
}: Props) {
  const [checkedIds, setCheckedIds] = React.useState<Set<string>>(new Set());
  const [menu, setMenu] = React.useState<{
    email: EmailListItem;
    x: number;
    y: number;
  } | null>(null);

  React.useEffect(() => {
    const visible = new Set(emails.map((e) => e.id));
    setCheckedIds((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [emails]);

  function openMenu(email: EmailListItem, x: number, y: number) {
    setMenu({ email, x, y });
  }
  function closeMenu() { setMenu(null); }

  // Filtra pastas custom relevantes (mesma conta da mensagem clicada)
  const menuFolders = React.useMemo(() => {
    if (!menu) return [];
    return customFolders.filter((f) => f.accountId === menu.email.accountId);
  }, [menu, customFolders]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonRow key={i} />
        ))}
      </div>
    );
  }

  if (emails.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-52 gap-2.5 text-[var(--text-muted)]">
        <IcoMailEmpty />
        <p className="text-[13px]">Nenhuma mensagem.</p>
      </div>
    );
  }

  const allChecked = emails.length > 0 && emails.every((e) => checkedIds.has(e.id));
  const someChecked = emails.some((e) => checkedIds.has(e.id)) && !allChecked;
  const selectedEmails = emails.filter((e) => checkedIds.has(e.id));
  const selectedAccountIds = new Set(selectedEmails.map((e) => e.accountId));
  const moveFolders = customFolders.filter((f) => selectedAccountIds.has(f.accountId));
  const canInbox = selectedEmails.some((e) => e.folder !== "INBOX" || e.customFolderId);
  const inTrashView = folder === "TRASH" || selectedEmails.every((e) => e.folder === "TRASH");

  function toggleChecked(id: string, next: boolean) {
    setCheckedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function toggleAll(next: boolean) {
    setCheckedIds(next ? new Set(emails.map((e) => e.id)) : new Set());
  }

  const checkedList = [...checkedIds];

  return (
    <div className="flex flex-col gap-2 p-3">
      <BulkBar
        allChecked={allChecked}
        someChecked={someChecked}
        count={checkedIds.size}
        total={emails.length}
        moveFolders={moveFolders}
        canInbox={canInbox}
        inTrash={inTrashView}
        busy={bulkBusy}
        onToggleAll={toggleAll}
        onMove={(folderId) => void onBulkMove?.(checkedList, folderId)}
        onInbox={() => void onBulkInbox?.(checkedList)}
        onTrash={() => void onBulkTrash?.(checkedList)}
      />
      {emails.map((email) => (
        <EmailRow
          key={email.id}
          email={email}
          selected={selectedId === email.id}
          checked={checkedIds.has(email.id)}
          dragIds={checkedIds.has(email.id) && checkedIds.size > 1 ? checkedList : [email.id]}
          folder={folder}
          showAccountTag={showAccountTag}
          accountEmail={accountEmails[email.accountId]}
          customFolder={customFolders.find((f) => f.id === email.customFolderId) ?? null}
          onSelect={onSelect}
          onCheckedChange={(next) => toggleChecked(email.id, next)}
          onTrash={onTrash}
          onRestore={onRestore}
          onDeletePermanent={onDeletePermanent}
          onContextMenu={openMenu}
        />
      ))}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          email={menu.email}
          folders={menuFolders}
          onClose={closeMenu}
          onToggleRead={onToggleRead}
          onTrash={onTrash}
          onRestore={onRestore}
          onDeletePermanent={onDeletePermanent}
          onMoveToCustomFolder={onMoveToCustomFolder}
          onRemoveFromCustomFolder={onRemoveFromCustomFolder}
        />
      )}
    </div>
  );
}

function initialsOf(name: string | null, email: string): string {
  const src = (name ?? email).trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}

function BulkBar({
  allChecked,
  someChecked,
  count,
  total,
  moveFolders,
  canInbox,
  inTrash,
  busy,
  onToggleAll,
  onMove,
  onInbox,
  onTrash,
}: {
  allChecked: boolean;
  someChecked: boolean;
  count: number;
  total: number;
  moveFolders: EmailCustomFolder[];
  canInbox: boolean;
  inTrash: boolean;
  busy: boolean;
  onToggleAll: (next: boolean) => void;
  onMove: (folderId: string) => void;
  onInbox: () => void;
  onTrash: () => void;
}) {
  const moveOptions = [
    ...(canInbox ? [{ value: "__inbox", label: "Caixa de entrada" }] : []),
    ...moveFolders.map((f) => ({ value: f.id, label: f.name })),
  ];

  return (
    <div className="flex items-center gap-2 px-1 pb-0.5">
      <CheckboxGlass
        checked={allChecked}
        indeterminate={someChecked}
        onChange={onToggleAll}
        aria-label="Selecionar todos"
      />
      <span className="min-w-0 flex-1 truncate font-display text-[12px] font-semibold text-[var(--text-muted)]">
        {count > 0
          ? `${count} selecionado${count === 1 ? "" : "s"}`
          : `Selecionar (${total})`}
      </span>
      {count > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {moveOptions.length > 0 ? (
            <DropdownGlass
              value=""
              placeholder="Mover"
              options={moveOptions}
              disabled={busy}
              triggerClassName="h-8 w-auto min-w-[6.5rem] px-2.5"
              matchTriggerWidth={false}
              onValueChange={(value) => {
                if (value === "__inbox") onInbox();
                else onMove(value);
              }}
            />
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={onTrash}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-2.5 font-display text-[12px] font-semibold text-[var(--text-secondary)] transition-colors hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] disabled:opacity-40"
          >
            <IcoTrash />
            {inTrash ? "Excluir" : "Excluir"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function EmailRow({
  email,
  selected,
  checked,
  dragIds,
  folder,
  showAccountTag,
  accountEmail,
  customFolder,
  onSelect,
  onCheckedChange,
  onTrash,
  onRestore,
  onDeletePermanent,
  onContextMenu,
}: {
  email: EmailListItem;
  selected: boolean;
  checked: boolean;
  dragIds: string[];
  folder: EmailFolder;
  showAccountTag: boolean;
  accountEmail: string | undefined;
  customFolder: EmailCustomFolder | null;
  onSelect: (id: string) => void;
  onCheckedChange: (next: boolean) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
  onContextMenu?: (email: EmailListItem, x: number, y: number) => void;
}) {
  const displayName =
    folder === "SENT" ? (email.toAddress ?? "") : (email.fromName ?? email.fromAddress);
  const avatarSrc = folder === "SENT" ? email.toAddress : email.fromAddress;
  const preview = email.bodyText ? decodeIfQuotedPrintable(email.bodyText).slice(0, 110) : "";
  const inTrash = email.folder === "TRASH";
  const folderTone = customFolder ? resolveFolderTone(customFolder.color, customFolder.name) : null;

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData("application/x-email-id", dragIds.join(","));
    e.dataTransfer.setData("application/x-email-account-id", email.accountId);
    e.dataTransfer.effectAllowed = "move";
    const ghost = document.createElement("div");
    ghost.textContent =
      dragIds.length > 1
        ? `${dragIds.length} e-mails`
        : email.subject || displayName || "E-mail";
    ghost.style.cssText = "position:absolute;top:-9999px;padding:6px 12px;background:var(--primary);color:var(--primary-foreground);font:500 12px Geist,sans-serif;border-radius:999px;";
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 10, 10);
    setTimeout(() => document.body.removeChild(ghost), 0);
  }

  function handleContextMenu(e: React.MouseEvent) {
    if (!onContextMenu) return;
    e.preventDefault();
    onContextMenu(email, e.clientX, e.clientY);
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onContextMenu={handleContextMenu}
      className="group relative"
    >
      <div
        className={cn(
          "flex w-full items-center gap-2 rounded-2xl border border-border bg-card pr-3 text-left transition-colors",
          selected
            ? "border-primary bg-primary/5 ring-1 ring-primary"
            : checked
              ? "border-primary/40 bg-primary/5"
              : "hover:bg-muted/50",
        )}
      >
        <div className="flex shrink-0 items-center self-stretch pl-3">
          <CheckboxGlass
            checked={checked}
            onChange={onCheckedChange}
            aria-label={`Selecionar ${email.subject ?? "e-mail"}`}
          />
        </div>
        <button
          type="button"
          onClick={() => onSelect(email.id)}
          className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left"
        >
        <IdentityAvatar
          name={folder === "SENT" ? displayName : email.fromName}
          seed={avatarSrc}
          initials={initialsOf(folder === "SENT" ? null : email.fromName, avatarSrc)}
          size="md"
          online={folder === "INBOX"}
        />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm leading-tight",
              email.isRead ? "font-medium text-foreground" : "font-bold text-foreground",
            )}
          >
            {displayName}
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {email.subject ?? "(sem assunto)"}
          </p>
          {preview ? (
            <p className="truncate text-sm text-muted-foreground">{preview}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {formatRelativeDate(email.receivedAt)}
          </span>
          {!email.isRead ? (
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              Novo
            </span>
          ) : null}
          {email.contact ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              <IconUser size={10} />
              {email.contact.name}
            </span>
          ) : null}
          {customFolder && folderTone ? (
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium"
              style={{
                background: FOLDER_TONE[folderTone].bg,
                color: FOLDER_TONE[folderTone].fg,
              }}
            >
              {customFolder.name}
            </span>
          ) : null}
          {showAccountTag && accountEmail ? (
            <span className="max-w-[140px] truncate font-mono text-xs text-muted-foreground">
              {accountEmail}
            </span>
          ) : null}
        </div>
        </button>
      </div>

      <div className="absolute top-2.5 right-2.5 hidden gap-1 group-hover:flex">
        {inTrash ? (
          <>
            {onRestore && (
              <RowAction
                label="Restaurar para INBOX"
                onClick={(e) => { e.stopPropagation(); onRestore(email.id); }}
              >
                <IcoUndo />
              </RowAction>
            )}
            {onDeletePermanent && (
              <RowAction
                label="Excluir permanentemente"
                danger
                onClick={(e) => { e.stopPropagation(); onDeletePermanent(email.id); }}
              >
                <IcoTrash />
              </RowAction>
            )}
          </>
        ) : (
          onTrash && (
            <RowAction
              label="Mover para lixeira"
              onClick={(e) => { e.stopPropagation(); onTrash(email.id); }}
            >
              <IcoTrash />
            </RowAction>
          )
        )}
      </div>
    </div>
  );
}

function RowAction({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={[
        "w-[26px] h-[26px] rounded-[var(--radius-sm)] flex items-center justify-center bg-[var(--glass-bg-base)] border border-[var(--glass-border)] shadow-sm transition-colors",
        danger
          ? "text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]"
          : "text-[var(--text-muted)] hover:text-[var(--brand-primary)] hover:border-[var(--brand-primary)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

// ── Context menu (botão direito) ──────────────────────────────────────────────
function ContextMenu({
  x,
  y,
  email,
  folders,
  onClose,
  onToggleRead,
  onTrash,
  onRestore,
  onDeletePermanent,
  onMoveToCustomFolder,
  onRemoveFromCustomFolder,
}: {
  x: number;
  y: number;
  email: EmailListItem;
  folders: EmailCustomFolder[];
  onClose: () => void;
  onToggleRead?: (id: string, isRead: boolean) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
  onMoveToCustomFolder?: (id: string, folderId: string) => void;
  onRemoveFromCustomFolder?: (id: string) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ x, y });

  // Fecha em clique fora e Escape
  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Ajusta posição quando ultrapassa a viewport (right/bottom edges)
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let nx = x;
    let ny = y;
    if (rect.right > vw - 8) nx = vw - rect.width - 8;
    if (rect.bottom > vh - 8) ny = vh - rect.height - 8;
    if (nx !== x || ny !== y) setPos({ x: nx, y: ny });
  }, [x, y]);

  const inTrash = email.folder === "TRASH";
  const inCustomFolder = !!email.customFolderId;

  function run(fn?: () => void) {
    if (fn) fn();
    onClose();
  }

  return (
    <div
      ref={ref}
      role="menu"
      style={{ position: "fixed", top: pos.y, left: pos.x, zIndex: "var(--z-popover)" }}
      className="min-w-[220px] py-1 rounded-[var(--radius-lg)] bg-[var(--glass-bg-base)] border border-[var(--glass-border)] shadow-[var(--glass-shadow-lg,0_10px_30px_rgba(0,0,0,0.18))] text-[13px] font-display"
    >
      {onToggleRead && (
        <MenuItem
          onClick={() => run(() => onToggleRead(email.id, !email.isRead))}
        >
          {email.isRead ? "Marcar como não lida" : "Marcar como lida"}
        </MenuItem>
      )}

      {!inTrash && onMoveToCustomFolder && folders.length > 0 && (
        <MenuGroup label="Mover para pasta">
          {folders.map((f) => (
            <MenuItem
              key={f.id}
              indent
              onClick={() => run(() => onMoveToCustomFolder(email.id, f.id))}
            >
              📁 {f.name}
            </MenuItem>
          ))}
        </MenuGroup>
      )}

      {!inTrash && onMoveToCustomFolder && folders.length === 0 && (
        <MenuItem disabled>
          <span className="text-[var(--text-muted)]">
            Crie pastas na barra lateral para mover
          </span>
        </MenuItem>
      )}

      {inCustomFolder && onRemoveFromCustomFolder && (
        <MenuItem onClick={() => run(() => onRemoveFromCustomFolder(email.id))}>
          Remover da pasta (voltar para Inbox)
        </MenuItem>
      )}

      <MenuSep />

      {!inTrash && onTrash && (
        <MenuItem onClick={() => run(() => onTrash(email.id))} danger>
          Mover para lixeira
        </MenuItem>
      )}

      {inTrash && onRestore && (
        <MenuItem onClick={() => run(() => onRestore(email.id))}>
          Restaurar para Caixa de entrada
        </MenuItem>
      )}

      {inTrash && onDeletePermanent && (
        <MenuItem
          onClick={() => run(() => onDeletePermanent(email.id))}
          danger
        >
          Excluir permanentemente
        </MenuItem>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
  disabled,
  indent,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  disabled?: boolean;
  indent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "block w-full text-left px-3 py-1.5 transition-colors",
        indent ? "pl-6" : "",
        disabled
          ? "cursor-default"
          : danger
            ? "text-[var(--color-danger,#dc2626)] hover:bg-[rgba(220,38,38,0.06)]"
            : "text-[var(--text-primary)] hover:bg-[var(--color-enterprise-bg,rgba(91,111,245,0.10))]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      {children}
    </div>
  );
}

function MenuSep() {
  return <div className="h-px bg-[var(--glass-border-subtle,var(--glass-border))] my-1 mx-1" />;
}

function SkeletonRow() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
      <span className="size-10 shrink-0 rounded-full bg-muted" />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="h-3.5 max-w-[140px] rounded-full bg-muted" />
        <span className="h-3 w-4/5 rounded-full bg-muted" />
      </div>
      <span className="h-5 w-12 shrink-0 rounded-full bg-accent/60" />
    </div>
  );
}
