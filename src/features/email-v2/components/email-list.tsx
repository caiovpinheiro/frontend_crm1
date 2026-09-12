"use client";

import * as React from "react";
import { IconUser } from "@tabler/icons-react";
import type { EmailCustomFolder, EmailFolder, EmailListItem } from "../api/types";
import { AVATAR_TONE_CLASS, avatarToneFromAddress } from "../lib/security-alert";
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
}: Props) {
  const [menu, setMenu] = React.useState<{
    email: EmailListItem;
    x: number;
    y: number;
  } | null>(null);

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
      <div className="flex flex-col gap-0">
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

  return (
    <div>
      {emails.map((email) => (
        <EmailRow
          key={email.id}
          email={email}
          selected={selectedId === email.id}
          folder={folder}
          showAccountTag={showAccountTag}
          accountEmail={accountEmails[email.accountId]}
          customFolder={customFolders.find((f) => f.id === email.customFolderId) ?? null}
          onSelect={onSelect}
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

function EmailRow({
  email,
  selected,
  folder,
  showAccountTag,
  accountEmail,
  customFolder,
  onSelect,
  onTrash,
  onRestore,
  onDeletePermanent,
  onContextMenu,
}: {
  email: EmailListItem;
  selected: boolean;
  folder: EmailFolder;
  showAccountTag: boolean;
  accountEmail: string | undefined;
  customFolder: EmailCustomFolder | null;
  onSelect: (id: string) => void;
  onTrash?: (id: string) => void;
  onRestore?: (id: string) => void;
  onDeletePermanent?: (id: string) => void;
  onContextMenu?: (email: EmailListItem, x: number, y: number) => void;
}) {
  const displayName =
    folder === "SENT" ? (email.toAddress ?? "") : (email.fromName ?? email.fromAddress);
  const avatarSrc = folder === "SENT" ? email.toAddress : email.fromAddress;
  const tone = avatarToneFromAddress(avatarSrc);
  const preview = email.bodyText ? decodeIfQuotedPrintable(email.bodyText).slice(0, 110) : "";
  const inTrash = email.folder === "TRASH";
  const folderTone = customFolder ? resolveFolderTone(customFolder.color, customFolder.name) : null;

  function handleDragStart(e: React.DragEvent) {
    // Tipo MIME custom para distinguir de outros drags no app
    e.dataTransfer.setData("application/x-email-id", email.id);
    e.dataTransfer.setData("application/x-email-account-id", email.accountId);
    e.dataTransfer.effectAllowed = "move";
    // Preview compacta — assunto/remetente
    const ghost = document.createElement("div");
    ghost.textContent = email.subject || displayName || "E-mail";
    ghost.style.cssText = "position:absolute;top:-9999px;padding:6px 12px;background:#5b6ff5;color:#fff;font:600 12px sans-serif;border-radius:999px;box-shadow:0 4px 14px rgba(91,111,245,.45);";
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
      className={cn(
        "group relative border-b border-[var(--glass-border)]",
        selected
          ? "bg-[var(--color-enterprise-bg,rgba(91,111,245,0.12))]"
          : "hover:bg-[var(--glass-bg-overlay)]",
      )}
    >
      <button
        onClick={() => onSelect(email.id)}
        className="relative flex w-full gap-3 px-3 py-3 text-left"
      >
        {selected ? (
          <span className="absolute bottom-0 left-0 top-0 w-[3px] rounded-r-full bg-[var(--brand-primary)]" />
        ) : null}

        <span
          className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold text-white",
            AVATAR_TONE_CLASS[tone],
          )}
        >
          {initialsOf(folder === "SENT" ? null : email.fromName, avatarSrc)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate font-display text-[13.5px] leading-tight",
                email.isRead
                  ? "font-semibold text-[var(--text-secondary)]"
                  : "font-bold text-[var(--text-primary)]",
              )}
            >
              {displayName}
            </span>
            <span className="shrink-0 font-body text-[11px] leading-tight text-[var(--text-muted)] group-hover:opacity-0">
              {formatRelativeDate(email.receivedAt)}
            </span>
          </div>

          <p
            className={cn(
              "mt-0.5 truncate font-display text-[12.5px] leading-tight",
              email.isRead
                ? "font-medium text-[var(--text-secondary)]"
                : "font-bold text-[var(--text-primary)]",
            )}
          >
            {email.subject ?? "(sem assunto)"}
          </p>

          {preview ? (
            <p className="mt-1.5 line-clamp-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2 py-1 font-body text-[12px] leading-snug text-[var(--text-muted)]">
              {preview}
            </p>
          ) : null}

          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            {!email.isRead ? (
              <span className="rounded-full bg-[var(--brand-primary)] px-1.5 py-0.5 font-display text-[9px] font-bold uppercase tracking-wide text-white">
                Novo
              </span>
            ) : null}
            {email.contact ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-1.5 py-0.5 font-display text-[10px] font-semibold text-[var(--text-secondary)]">
                <IconUser size={10} />
                {email.contact.name}
              </span>
            ) : null}
            {customFolder && folderTone ? (
              <span
                className="rounded-full px-1.5 py-0.5 font-display text-[10px] font-semibold"
                style={{
                  background: FOLDER_TONE[folderTone].bg,
                  color: FOLDER_TONE[folderTone].fg,
                }}
              >
                {customFolder.name}
              </span>
            ) : null}
            {showAccountTag && accountEmail ? (
              <span className="rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-1.5 py-0.5 font-display text-[10px] text-[var(--text-muted)]">
                {accountEmail}
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {/* Ações hover (canto superior direito) */}
      <div className="absolute right-3 top-3 hidden group-hover:flex gap-1">
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
    <div className="flex flex-col gap-1.5 px-4 py-3.5 border-b border-[var(--glass-border-subtle,var(--glass-border))] animate-pulse">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[var(--glass-border)] shrink-0" />
        <span className="h-3.5 rounded bg-[var(--glass-border)] flex-1 max-w-[140px]" />
        <span className="h-3 rounded bg-[var(--glass-border)] w-12 shrink-0" />
      </div>
      <span className="h-3 rounded bg-[var(--glass-border)] w-4/5 ml-4" />
      <span className="h-3 rounded bg-[var(--glass-border)] w-3/5 ml-4 opacity-60" />
    </div>
  );
}
