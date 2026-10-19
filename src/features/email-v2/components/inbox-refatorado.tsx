"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  IconAdjustments,
  IconArchive,
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconChevronDown,
  IconFolder,
  IconInbox,
  IconMail,
  IconMenu2,
  IconNote,
  IconPlus,
  IconRefresh,
  IconSend,
  IconShieldExclamation,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { IdentityAvatar } from "@/components/crm/identity-avatar";
import { PageActionsMenu } from "@/components/crm/page-toolbar";
import { SearchFilterBar } from "@/components/crm/search-filter-bar";
import { SectionHeader } from "@/components/crm/section-header";
import { FormDialog } from "@/components/ui/form-dialog";
import { useMobileChatChrome } from "@/hooks/use-mobile-chat-chrome";
import { cn } from "@/lib/utils";
import {
  useEmailAccounts,
  useEmailCustomFolders,
  useEmails,
  useEmailDetail,
} from "../hooks";
import {
  deleteEmail,
  markEmailsAsSpam,
  moveEmail,
} from "../api/emails";
import type {
  EmailAccount,
  EmailCustomFolder,
  EmailDetail,
  EmailFolder,
  EmailListItem,
} from "../api/types";
import { ComposeView } from "./compose-view";
import { EmailRulesModal } from "./email-rules-modal";
import { HtmlEmailFrame, decodeIfQuotedPrintable } from "./html-email-frame";
import {
  buildComposeDraft,
  newComposeDraft,
  type ComposeDraft,
} from "../utils/compose-draft";

/* ------------------------------------------------------------------ */
/* Tokens de layout — só classes do DS (bg-card, border-border, …).   */
/* ------------------------------------------------------------------ */
const CARD_CLASS = "rounded-xl border border-border bg-card";

const PILL_BTN_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors";
const PILL_BTN_OFF_CLASS = "border-border bg-card text-foreground hover:bg-muted";
const PILL_BTN_ON_CLASS = "border-primary bg-primary text-primary-foreground";

const ROUND_ICON_BTN_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

type IconComponent = React.ComponentType<{ size?: number; stroke?: number; className?: string }>;

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const stripHtml = (s: string | null): string =>
  decodeIfQuotedPrintable(s ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sameDay = (a: Date, b: Date): boolean =>
  a.getDate() === b.getDate() &&
  a.getMonth() === b.getMonth() &&
  a.getFullYear() === b.getFullYear();

const shortTime = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

const groupLabel = (iso: string | null): string => {
  if (!iso) return "Sem data";
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return "Hoje";
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (sameDay(d, yesterday)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
};

const fullDate = (iso: string | null): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " às " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
};

const initials = (name: string | null): string =>
  (name ?? "")
    .replace(/[@].*/, "")
    .split(/[\s._]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

/* ------------------------------------------------------------------ */
/* Pastas                                                              */
/* ------------------------------------------------------------------ */
interface FolderItem {
  id: string;
  label: string;
  Icon?: IconComponent;
  count?: number;
  quiet?: boolean;
}

function FolderRow({
  label,
  Icon = IconFolder,
  count,
  quiet,
  active,
  busy,
  onClick,
}: FolderItem & { active: boolean; busy?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy || undefined}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-lg px-3 text-left text-[13px] transition-colors disabled:cursor-wait disabled:opacity-60",
        active ? "bg-primary/10 font-semibold text-primary" : "text-foreground hover:bg-muted",
      )}
    >
      <Icon size={16} className={cn(active ? "text-primary" : "text-muted-foreground", busy && "animate-spin")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && count > 0 ? (
        <span
          className={cn(
            "text-xs tabular-nums",
            active ? "text-primary" : quiet ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

interface SidebarProps {
  accounts: EmailAccount[];
  folders: EmailCustomFolder[];
  selectedAccountId?: string;
  selectedFolder: EmailFolder;
  selectedCustomFolderId: string | null;
  counts: { inbox: number; sent: number; spam: number; trash: number };
  onSelectAccount: (id?: string) => void;
  onSelectFolder: (folder: EmailFolder) => void;
  onSelectCustomFolder: (id: string | null) => void;
  onOpenRules: () => void;
  onRefresh: () => void;
  /** Sincronização em andamento: o botão Atualizar fica travado e girando. */
  refreshing: boolean;
  onNew: () => void;
}

function systemFolders(counts: SidebarProps["counts"]): FolderItem[] {
  return [
    { id: "INBOX", label: "Caixa de entrada", Icon: IconInbox, count: counts.inbox },
    { id: "SENT", label: "Enviados", Icon: IconSend, count: counts.sent },
    { id: "SPAM", label: "Spam", Icon: IconShieldExclamation, count: counts.spam },
    { id: "TRASH", label: "Excluídos", Icon: IconTrash, count: counts.trash, quiet: true },
  ];
}

function AccountSelect({
  accounts,
  selectedAccountId,
  onSelectAccount,
  className,
}: Pick<SidebarProps, "accounts" | "selectedAccountId" | "onSelectAccount"> & { className?: string }) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Conta</span>
      <select
        value={selectedAccountId ?? "all"}
        onChange={(e) => onSelectAccount(e.target.value === "all" ? undefined : e.target.value)}
        className="h-9 w-full cursor-pointer appearance-none truncate rounded-lg border border-border bg-card pl-2.5 pr-8 text-[13px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
      >
        <option value="all">Todas as contas</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.email}
          </option>
        ))}
      </select>
      <IconChevronDown
        size={14}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </label>
  );
}

/** Coluna de pastas — só desktop (`md:`). */
function Sidebar({
  accounts,
  folders,
  selectedAccountId,
  selectedFolder,
  selectedCustomFolderId,
  counts,
  onSelectAccount,
  onSelectFolder,
  onSelectCustomFolder,
  onOpenRules,
  onRefresh,
  refreshing,
  onNew,
}: SidebarProps) {
  const activeSystem = selectedCustomFolderId === null;

  return (
    <aside
      className={cn(
        CARD_CLASS,
        "hidden w-[220px] shrink-0 flex-col gap-1 overflow-y-auto p-3.5 md:flex",
      )}
    >
      <button
        type="button"
        onClick={onNew}
        className="flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-primary text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-primary-dark"
      >
        <IconPlus size={16} stroke={2.2} /> Escrever
      </button>

      <div className="mx-1 mb-0.5 mt-2.5 text-[11px] font-semibold text-muted-foreground">Conta</div>
      <AccountSelect
        accounts={accounts}
        selectedAccountId={selectedAccountId}
        onSelectAccount={onSelectAccount}
      />

      <nav className="mt-2 flex flex-col gap-0.5">
        {systemFolders(counts).map((f) => (
          <FolderRow
            key={f.id}
            {...f}
            active={activeSystem && selectedFolder === f.id}
            onClick={() => onSelectFolder(f.id as EmailFolder)}
          />
        ))}
      </nav>

      {folders.length > 0 && (
        <>
          <div className="mx-1 mb-0.5 mt-3 text-[11px] font-semibold text-muted-foreground">Pastas</div>
          <nav className="flex flex-col gap-0.5">
            {folders.map((f) => (
              <FolderRow
                key={f.id}
                id={f.id}
                label={f.name}
                count={f.unreadCount}
                quiet
                active={selectedCustomFolderId === f.id}
                onClick={() => onSelectCustomFolder(f.id)}
              />
            ))}
          </nav>
        </>
      )}

      <div className="mt-auto flex flex-col gap-0.5 pt-3">
        <FolderRow id="rules" label="Regras" Icon={IconAdjustments} active={false} onClick={onOpenRules} />
        <FolderRow
          id="refresh"
          label={refreshing ? "Atualizando…" : "Atualizar"}
          Icon={IconRefresh}
          active={false}
          busy={refreshing}
          onClick={onRefresh}
        />
      </div>
    </aside>
  );
}

/** Pastas como chips roláveis — só mobile (`< md`). */
function FolderChips({
  accounts,
  folders,
  selectedAccountId,
  selectedFolder,
  selectedCustomFolderId,
  counts,
  onSelectAccount,
  onSelectFolder,
  onSelectCustomFolder,
}: Omit<SidebarProps, "onOpenRules" | "onRefresh" | "refreshing" | "onNew">) {
  const activeSystem = selectedCustomFolderId === null;
  const chips: (FolderItem & { active: boolean; onClick: () => void })[] = [
    ...systemFolders(counts).map((f) => ({
      ...f,
      active: activeSystem && selectedFolder === f.id,
      onClick: () => onSelectFolder(f.id as EmailFolder),
    })),
    ...folders.map((f) => ({
      id: f.id,
      label: f.name,
      count: f.unreadCount,
      active: selectedCustomFolderId === f.id,
      onClick: () => onSelectCustomFolder(f.id),
    })),
  ];

  return (
    <div className="flex shrink-0 items-center gap-2 overflow-x-auto overscroll-x-contain px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
      {accounts.length > 1 ? (
        <AccountSelect
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={onSelectAccount}
          className="w-36 shrink-0 [&>select]:h-8 [&>select]:rounded-full [&>select]:font-semibold"
        />
      ) : null}
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={c.onClick}
          aria-current={c.active ? "true" : undefined}
          className={cn(PILL_BTN_CLASS, c.active ? PILL_BTN_ON_CLASS : PILL_BTN_OFF_CLASS)}
        >
          {c.label}
          {c.count !== undefined && c.count > 0 ? (
            <span
              className={cn(
                "inline-flex h-4.5 items-center rounded-full px-1.5 text-[11px] tabular-nums",
                c.active ? "bg-primary-foreground/25" : "bg-muted text-muted-foreground",
              )}
            >
              {c.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista                                                               */
/* ------------------------------------------------------------------ */
interface MessageRowProps {
  m: EmailListItem;
  active: boolean;
  selected: boolean;
  onOpen: () => void;
  onDoubleClick?: () => void;
  onToggle: () => void;
  dense: boolean;
}

function MessageRow({ m, active, selected, onOpen, onDoubleClick, onToggle, dense }: MessageRowProps) {
  const fromName = m.fromName || m.fromAddress;
  const unread = !m.isRead;

  return (
    <div
      onClick={onOpen}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className={cn(
        "group grid cursor-pointer grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-3 border-t border-border px-3.5 outline-none transition-colors focus-visible:bg-muted",
        dense ? "py-2" : "py-3",
        active ? "bg-primary/10" : selected ? "bg-muted" : "hover:bg-muted/60",
      )}
    >
      <div className="relative size-9 shrink-0">
        <span className={cn("absolute inset-0", selected ? "hidden" : "group-hover:hidden")}>
          <IdentityAvatar
            name={fromName}
            seed={m.fromAddress}
            initials={initials(fromName)}
            imageUrl={m.contact?.avatarUrl ?? null}
            size={36}
          />
        </span>
        <span
          className={cn(
            "absolute inset-0 items-center justify-center",
            selected ? "flex" : "hidden group-hover:flex",
          )}
        >
          <input
            type="checkbox"
            aria-label="Selecionar e-mail"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
            className="size-4 cursor-pointer accent-primary"
          />
        </span>
      </div>

      <div className="min-w-0">
        <div
          className={cn(
            "truncate text-[13px] leading-tight text-foreground",
            unread ? "font-semibold" : "font-medium",
          )}
        >
          {fromName}
        </div>
        <div className={cn("mt-0.5 truncate text-[13px] text-foreground", unread && "font-semibold")}>
          {m.subject || "(sem assunto)"}
        </div>
        {!dense && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{stripHtml(m.bodyText)}</div>
        )}
      </div>

      <div className="flex flex-col items-end gap-1.5 text-[11px] tabular-nums text-muted-foreground">
        {shortTime(m.receivedAt)}
        {unread ? <span className="size-2 rounded-full bg-primary" aria-label="Não lido" /> : null}
      </div>
    </div>
  );
}

type FilterKey = "todos" | "nao-lidos" | "pessoas";

interface ListProps {
  emails: EmailListItem[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onOpenReply: (id: string) => void;
  selected: string[];
  setSelected: (ids: string[] | ((prev: string[]) => string[])) => void;
  folderLabel: string;
  folderUnread: number;
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  total?: number;
  unreadOnly: boolean;
  onUnreadOnly: (value: boolean) => void;
  onArchive: () => void;
  onSpam: () => void;
  onTrash: () => void;
  className?: string;
}

function List({
  emails,
  activeId,
  setActiveId,
  onOpenReply,
  selected,
  setSelected,
  folderLabel,
  folderUnread,
  loading,
  hasMore,
  onLoadMore,
  total,
  unreadOnly,
  onUnreadOnly,
  onArchive,
  onSpam,
  onTrash,
  className,
}: ListProps) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const [dense, setDense] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    let out = emails;
    if (filter === "pessoas") out = out.filter((m) => !!m.contact);
    return out;
  }, [emails, filter]);

  const groups = useMemo(() => {
    const out: { label: string; items: EmailListItem[] }[] = [];
    filtered.forEach((m) => {
      const label = groupLabel(m.receivedAt);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(m);
      else out.push({ label, items: [m] });
    });
    return out;
  }, [filtered]);

  const chips: { id: FilterKey; label: string; count: number }[] = [
    { id: "todos", label: "Tudo", count: emails.length },
    { id: "nao-lidos", label: "Não lidos", count: folderUnread },
    { id: "pessoas", label: "Pessoas", count: emails.filter((m) => !!m.contact).length },
  ];

  const anySelected = selected.length > 0;

  useEffect(() => {
    const el = listRef.current;
    if (!el || !hasMore || loading) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100) onLoadMore();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMore, loading, onLoadMore]);

  return (
    <section
      aria-label="Lista de e-mails"
      className={cn(
        CARD_CLASS,
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:w-[392px] md:flex-none",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5 px-3.5 pb-2 pt-3">
        {chips.map(({ id, label, count }) => {
          const on =
            id === "nao-lidos"
              ? unreadOnly
              : id === "todos"
                ? !unreadOnly && filter === "todos"
                : filter === id && !unreadOnly;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              onClick={() => {
                if (id === "nao-lidos") {
                  onUnreadOnly(!unreadOnly);
                  setFilter("todos");
                } else {
                  onUnreadOnly(false);
                  setFilter(id);
                }
              }}
              className={cn(PILL_BTN_CLASS, on ? PILL_BTN_ON_CLASS : PILL_BTN_OFF_CLASS)}
            >
              {label}
              <span
                className={cn(
                  "inline-flex h-4.5 items-center rounded-full px-1.5 text-[11px] tabular-nums",
                  on ? "bg-primary-foreground/25" : "bg-muted text-muted-foreground",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDense((d) => !d)}
          aria-pressed={dense}
          aria-label={dense ? "Mostrar prévia" : "Modo compacto"}
          title={dense ? "Mostrar prévia" : "Modo compacto"}
          className={cn(ROUND_ICON_BTN_CLASS, "ml-auto", dense && "bg-primary/10 text-primary")}
        >
          <IconMenu2 size={14} />
        </button>
      </div>

      <div
        className={cn(
          "flex min-h-9 items-center gap-2 overflow-x-auto border-b border-border px-3.5 pb-2 text-xs",
          anySelected ? "text-primary" : "text-muted-foreground",
        )}
      >
        {anySelected ? (
          <>
            <span className="mr-1 font-semibold">{selected.length} selecionados</span>
            {[
              [IconArchive, "Arquivar", onArchive] as const,
              [IconShieldExclamation, "Spam", onSpam] as const,
              [IconTrash, "Excluir", onTrash] as const,
            ].map(([I, label, action]) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className="flex items-center gap-1 rounded-full px-2 py-1 font-semibold transition-colors hover:bg-primary/10"
              >
                <I size={14} /> {label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="ml-auto rounded-full px-2 py-1 text-foreground transition-colors hover:bg-muted"
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span className="truncate font-semibold text-foreground">{folderLabel}</span>
            <span className="shrink-0 tabular-nums">
              {folderUnread} não lidos · {total ?? emails.length} total
            </span>
          </>
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading && emails.length === 0 && (
          <div className="p-12 text-center text-[13px] text-muted-foreground">Carregando e-mails…</div>
        )}
        {!loading && groups.length === 0 && (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-semibold text-foreground">Nada por aqui</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Ajuste a busca ou volte para o filtro Tudo.
            </p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="sticky top-0 z-10 bg-card/95 px-3.5 pb-1 pt-2.5 text-[11px] font-semibold text-muted-foreground backdrop-blur-sm">
              {g.label}
            </div>
            {g.items.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                dense={dense}
                active={m.id === activeId}
                selected={selected.includes(m.id)}
                onOpen={() => setActiveId(m.id)}
                onDoubleClick={() => onOpenReply(m.id)}
                onToggle={() =>
                  setSelected((s) =>
                    s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id],
                  )
                }
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Leitura                                                             */
/* ------------------------------------------------------------------ */
interface ReaderProps {
  email: EmailDetail | null;
  loading: boolean;
  folder: EmailFolder;
  folderLabel: string;
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onSpam: () => void;
  onTrash: () => void;
  className?: string;
}

function ActionPill({
  Icon,
  label,
  onClick,
}: {
  Icon: IconComponent;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={cn(PILL_BTN_CLASS, PILL_BTN_OFF_CLASS)}>
      <Icon size={15} />
      {label}
    </button>
  );
}

function Reader({
  email,
  loading,
  folder,
  folderLabel,
  onBack,
  onReply,
  onForward,
  onArchive,
  onSpam,
  onTrash,
  className,
}: ReaderProps) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [email?.id]);

  const shell = cn(CARD_CLASS, "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden", className);

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted md:hidden"
    >
      <IconArrowLeft size={16} stroke={2} />
      Voltar
    </button>
  );

  if (loading || !email) {
    return (
      <section aria-label="Leitura do e-mail" className={shell}>
        <div className="flex items-center border-b border-border px-3 py-2 md:hidden">{backButton}</div>
        <div className="flex flex-1 items-center justify-center p-6 text-[13px] text-muted-foreground">
          {loading ? "Carregando e-mail…" : "Selecione um e-mail para ler"}
        </div>
      </section>
    );
  }

  const fromName = email.fromName || email.fromAddress;
  const decodedBodyText = decodeIfQuotedPrintable(email.bodyText ?? "");
  const hasHtml = Boolean(email.bodyHtml?.trim());
  const hasText = Boolean(decodedBodyText.trim());

  return (
    <section aria-label="Leitura do e-mail" className={shell}>
      <div className="flex items-center border-b border-border px-3 py-2 md:hidden">{backButton}</div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3.5 py-3 md:px-4">
        <ActionPill Icon={IconArrowBackUp} label="Responder" onClick={onReply} />
        <ActionPill Icon={IconArrowForwardUp} label="Encaminhar" onClick={onForward} />
        <ActionPill Icon={IconArchive} label="Arquivar" onClick={onArchive} />
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => setNoteOpen((o) => !o)}
            aria-pressed={noteOpen}
            aria-label={note ? "Anotação interna (1)" : "Anotar"}
            title={note ? "Anotação interna (1)" : "Anotar"}
            className={cn(ROUND_ICON_BTN_CLASS, (noteOpen || note) && "bg-primary/10 text-primary")}
          >
            <IconNote size={16} />
          </button>
          <button
            type="button"
            onClick={onSpam}
            aria-label={folder === "SPAM" ? "Não é spam" : "Marcar como spam"}
            title={folder === "SPAM" ? "Não é spam" : "Marcar como spam"}
            className={ROUND_ICON_BTN_CLASS}
          >
            <IconShieldExclamation size={16} />
          </button>
          <button
            type="button"
            onClick={onTrash}
            aria-label="Excluir"
            title="Excluir"
            className={ROUND_ICON_BTN_CLASS}
          >
            <IconTrash size={16} />
          </button>
        </div>
      </div>

      <div ref={ref} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
        <div className="flex max-w-3xl flex-col gap-3.5">
          <h2 className="font-display text-lg font-bold leading-tight tracking-tight text-foreground">
            {email.subject || "(sem assunto)"}
          </h2>

          <div className="flex items-center gap-3">
            <IdentityAvatar name={fromName} seed={email.fromAddress} initials={initials(fromName)} size={40} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold text-foreground">
                {fromName}{" "}
                <span className="font-normal text-muted-foreground">&lt;{email.fromAddress}&gt;</span>
              </div>
              <div className="truncate text-xs text-muted-foreground">
                para {email.toAddress} · <span className="tabular-nums">{fullDate(email.receivedAt)}</span>
              </div>
            </div>
            <span className="hidden h-5.5 shrink-0 items-center rounded-full bg-primary/10 px-2.5 text-[11px] font-semibold text-primary sm:inline-flex">
              {folderLabel}
            </span>
          </div>

          {noteOpen && (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visível só para o time. Ex.: aguardando retorno do jurídico."
              rows={2}
              className="w-full resize-y rounded-lg border border-border bg-muted p-2.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/30"
            />
          )}

          <div className="border-t border-border" />

          {hasHtml && (
            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Imagens e conteúdo externo serão carregados abaixo.
            </div>
          )}

          {hasHtml ? (
            <HtmlEmailFrame html={email.bodyHtml ?? ""} />
          ) : hasText ? (
            <div className="text-sm leading-relaxed text-foreground">
              {decodedBodyText.split(/\n{2,}/).map((p, i) => (
                <p key={i} className="mb-3 whitespace-pre-wrap last:mb-0">
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">(sem conteúdo)</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2.5 border-t border-border px-3.5 py-3 md:px-4">
        <button
          type="button"
          onClick={onReply}
          className="flex h-10 min-w-0 flex-1 items-center truncate rounded-full border border-border bg-card px-4 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted"
        >
          Responder a {fromName}…
        </button>
        <button
          type="button"
          onClick={onReply}
          aria-label="Responder"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          <IconSend size={16} />
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                 */
/* ------------------------------------------------------------------ */
export default function InboxRefatorado() {
  const { accounts, loading: accountsLoading, reload: reloadAccounts, sync } = useEmailAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(undefined);
  const [selectedFolder, setSelectedFolder] = useState<EmailFolder>("INBOX");
  const [selectedCustomFolderId, setSelectedCustomFolderId] = useState<string | null>(null);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [composing, setComposing] = useState(false);
  const [composeDraft, setComposeDraft] = useState<ComposeDraft>(newComposeDraft());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [expandedReplyId, setExpandedReplyId] = useState<string | null>(null);

  // Mobile: leitor/compose em tela cheia escondem a bottom nav global.
  const mobileImmersive = composing || selectedEmailId !== null;
  useMobileChatChrome(mobileImmersive);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { folders: customFolders, reload: reloadCustomFolders } = useEmailCustomFolders(selectedAccountId);

  const {
    emails,
    pagination,
    loading: emailsLoading,
    hasMore,
    loadMore,
    refresh: refreshEmails,
    markRead,
  } = useEmails({
    accountId: selectedAccountId,
    folder: selectedCustomFolderId ? undefined : selectedFolder,
    customFolderId: selectedCustomFolderId ?? undefined,
    search: debouncedSearch || undefined,
    unreadOnly,
  });

  const { email: emailDetail, loading: detailLoading } = useEmailDetail(
    composing ? null : selectedEmailId,
  );

  useEffect(() => {
    if (!selectedEmailId) return;
    const email = emails.find((e) => e.id === selectedEmailId);
    if (email && !email.isRead) {
      void markRead(selectedEmailId, true);
    }
  }, [selectedEmailId, emails, markRead]);

  const folderCounts = useMemo(() => {
    if (selectedCustomFolderId) {
      const folder = customFolders.find((f) => f.id === selectedCustomFolderId);
      return { inbox: 0, sent: 0, spam: 0, trash: 0, custom: folder?.unreadCount ?? 0 };
    }
    if (selectedAccountId) {
      const acc = accounts.find((a) => a.id === selectedAccountId);
      if (!acc) return { inbox: 0, sent: 0, spam: 0, trash: 0 };
      const c = acc.folderUnread;
      return {
        inbox: c?.inbox ?? acc.unreadCount,
        sent: c?.sent ?? 0,
        spam: c?.spam ?? 0,
        trash: c?.trash ?? 0,
      };
    }
    return accounts.reduce(
      (s, a) => {
        const c = a.folderUnread;
        s.inbox += c?.inbox ?? a.unreadCount;
        s.sent += c?.sent ?? 0;
        s.spam += c?.spam ?? 0;
        s.trash += c?.trash ?? 0;
        return s;
      },
      { inbox: 0, sent: 0, spam: 0, trash: 0 },
    );
  }, [accounts, selectedAccountId, customFolders, selectedCustomFolderId]);

  const folderLabel = useMemo(() => {
    if (selectedCustomFolderId) {
      return customFolders.find((f) => f.id === selectedCustomFolderId)?.name ?? "Pasta";
    }
    if (selectedFolder === "INBOX") return "Caixa de entrada";
    if (selectedFolder === "SENT") return "Enviados";
    if (selectedFolder === "SPAM") return "Spam";
    return "Excluídos";
  }, [selectedFolder, selectedCustomFolderId, customFolders]);

  const folderUnread = useMemo(() => {
    if (selectedCustomFolderId) return customFolders.find((f) => f.id === selectedCustomFolderId)?.unreadCount ?? 0;
    if (selectedFolder === "INBOX") return folderCounts.inbox;
    if (selectedFolder === "SENT") return folderCounts.sent;
    if (selectedFolder === "SPAM") return folderCounts.spam;
    return folderCounts.trash;
  }, [folderCounts, selectedFolder, selectedCustomFolderId, customFolders]);

  // Uma atualização por vez: cada clique sincroniza TODAS as contas por IMAP.
  // Sem a trava, o usuário clicava várias vezes (o botão não reagia) e cada
  // clique disparava um novo lote de syncs no servidor.
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const refreshAll = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      const results = await Promise.all(accounts.map((a) => sync(a.id).catch(() => ({ synced: 0 }))));
      const synced = results.reduce((sum, r) => sum + (r.synced ?? 0), 0);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      refreshEmails();
      reloadAccounts();
      reloadCustomFolders();
      if (synced > 0) toast.success(`${synced} e-mail${synced > 1 ? "s" : ""} sincronizado${synced > 1 ? "s" : ""}.`);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }, [accounts, sync, refreshEmails, reloadAccounts, reloadCustomFolders]);

  const runBulk = useCallback(
    async (ids: string[], action: (id: string) => Promise<void>, okMsg: string) => {
      const unique = [...new Set(ids.filter(Boolean))];
      if (unique.length === 0) return;
      await Promise.all(unique.map((id) => action(id).catch(() => {})));
      toast.success(okMsg);
      refreshEmails();
      reloadAccounts();
      if (selectedEmailId && unique.includes(selectedEmailId)) setSelectedEmailId(null);
      setSelected([]);
    },
    [refreshEmails, reloadAccounts, selectedEmailId],
  );

  const handleTrash = useCallback(async () => {
    const ids = selected.length > 0 ? selected : selectedEmailId ? [selectedEmailId] : [];
    if (selectedFolder === "TRASH") {
      await runBulk(ids, deleteEmail, ids.length === 1 ? "E-mail excluído." : `${ids.length} e-mails excluídos.`);
    } else {
      await runBulk(
        ids,
        (id) => moveEmail(id, { systemFolder: "TRASH", customFolderId: null }),
        ids.length === 1 ? "E-mail movido para lixeira." : `${ids.length} e-mails movidos para lixeira.`,
      );
    }
  }, [selected, selectedEmailId, selectedFolder, runBulk]);

  const handleArchive = useCallback(async () => {
    const ids = selected.length > 0 ? selected : selectedEmailId ? [selectedEmailId] : [];
    await runBulk(
      ids,
      (id) => moveEmail(id, { systemFolder: "TRASH", customFolderId: null }),
      ids.length === 1 ? "E-mail arquivado." : `${ids.length} e-mails arquivados.`,
    );
  }, [selected, selectedEmailId, runBulk]);

  const handleSpam = useCallback(async () => {
    const ids = selected.length > 0 ? selected : selectedEmailId ? [selectedEmailId] : [];
    const undo = selectedFolder === "SPAM";
    await runBulk(
      ids,
      (id) => markEmailsAsSpam([id], undo).then(() => {}),
      undo
        ? ids.length === 1
          ? "Marcado como não é spam."
          : `${ids.length} e-mails marcados como não spam.`
        : ids.length === 1
          ? "Marcado como spam."
          : `${ids.length} e-mails marcados como spam.`,
    );
  }, [selected, selectedEmailId, selectedFolder, runBulk]);

  const openCompose = useCallback((draft: ComposeDraft) => {
    setComposeDraft(draft);
    setComposing(true);
  }, []);

  const handleReply = useCallback(() => {
    if (!emailDetail) return;
    openCompose(buildComposeDraft(emailDetail, "reply"));
  }, [emailDetail, openCompose]);

  const handleForward = useCallback(() => {
    if (!emailDetail) return;
    openCompose(buildComposeDraft(emailDetail, "forward"));
  }, [emailDetail, openCompose]);

  const handleNew = useCallback(() => {
    openCompose(newComposeDraft(selectedAccountId ?? accounts[0]?.id));
  }, [openCompose, selectedAccountId, accounts]);

  const handleSent = useCallback(
    (id: string) => {
      setComposing(false);
      setExpandedReplyId(null);
      setSelectedEmailId(id);
      setSelectedFolder("SENT");
      setSelectedCustomFolderId(null);
      refreshEmails();
      reloadAccounts();
      toast.success("E-mail enviado.");
    },
    [refreshEmails, reloadAccounts],
  );

  const handleOpenReply = useCallback((id: string) => {
    setSelectedEmailId(id);
    setExpandedReplyId(id);
  }, []);

  const handleSelectFolder = useCallback((folder: EmailFolder) => {
    setSelectedFolder(folder);
    setSelectedCustomFolderId(null);
    setSelectedEmailId(null);
    setSelected([]);
  }, []);

  const handleSelectCustomFolder = useCallback((id: string | null) => {
    setSelectedCustomFolderId(id);
    if (id) setSelectedFolder("INBOX");
    setSelectedEmailId(null);
    setSelected([]);
  }, []);

  const handleSelectAccount = useCallback((id?: string) => {
    setSelectedAccountId(id);
    setSelectedEmailId(null);
    setSelected([]);
  }, []);

  const composeAccounts = selectedAccountId
    ? accounts.filter((a) => a.id === selectedAccountId)
    : accounts;

  if (accountsLoading && accounts.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-muted-foreground">
        Carregando contas…
      </div>
    );
  }

  const folderProps = {
    accounts,
    folders: customFolders,
    selectedAccountId,
    selectedFolder,
    selectedCustomFolderId,
    counts: folderCounts,
    onSelectAccount: handleSelectAccount,
    onSelectFolder: handleSelectFolder,
    onSelectCustomFolder: handleSelectCustomFolder,
  };

  return (
    <div className="flex h-full min-h-0 flex-col text-foreground">
      <SectionHeader
        icon={<IconMail size={22} />}
        title="E-mail"
        stackSearchOnMobile
        searchSlot={
          <SearchFilterBar
            value={search}
            onChange={setSearch}
            placeholder="Pesquisar por remetente, assunto ou conteúdo…"
            clearable
            filterOpen={unreadOnly}
            activeCount={unreadOnly ? 1 : 0}
            onFilterClick={() => setUnreadOnly((v) => !v)}
          />
        }
        actions={
          <button
            type="button"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            aria-busy={refreshing || undefined}
            aria-label={refreshing ? "Atualizando…" : "Atualizar"}
            title={refreshing ? "Atualizando…" : "Atualizar"}
            className="hidden size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-wait disabled:opacity-60 disabled:hover:bg-card md:flex"
          >
            <IconRefresh size={17} className={refreshing ? "animate-spin" : undefined} />
          </button>
        }
        menuSlot={
          <PageActionsMenu
            items={[
              { icon: <IconPlus size={16} />, label: "Escrever", onClick: handleNew },
              {
                icon: <IconRefresh size={16} className={refreshing ? "animate-spin" : undefined} />,
                label: refreshing ? "Atualizando…" : "Atualizar",
                onClick: () => void refreshAll(),
                disabled: refreshing,
              },
              { icon: <IconAdjustments size={16} />, label: "Regras", onClick: () => setRulesOpen(true) },
            ]}
          />
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 pt-2 md:flex-row md:gap-4">
        <Sidebar
          {...folderProps}
          onOpenRules={() => setRulesOpen(true)}
          onRefresh={() => void refreshAll()}
          refreshing={refreshing}
          onNew={handleNew}
        />

        {!mobileImmersive ? <FolderChips {...folderProps} /> : null}

        {!composing && (
          <List
            emails={emails}
            activeId={selectedEmailId}
            setActiveId={setSelectedEmailId}
            selected={selected}
            setSelected={setSelected}
            folderLabel={folderLabel}
            folderUnread={folderUnread}
            loading={emailsLoading}
            hasMore={hasMore}
            onLoadMore={loadMore}
            total={pagination?.total}
            unreadOnly={unreadOnly}
            onUnreadOnly={setUnreadOnly}
            onOpenReply={handleOpenReply}
            onArchive={handleArchive}
            onSpam={handleSpam}
            onTrash={handleTrash}
            className={selectedEmailId !== null ? "max-md:hidden" : undefined}
          />
        )}

        {composing ? (
          <div className={cn(CARD_CLASS, "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden")}>
            <ComposeView
              accounts={composeAccounts.length > 0 ? composeAccounts : accounts}
              draft={composeDraft}
              onCancel={() => setComposing(false)}
              onBack={() => setComposing(false)}
              onSent={handleSent}
            />
          </div>
        ) : (
          <Reader
            email={emailDetail}
            loading={detailLoading}
            folder={selectedFolder}
            folderLabel={folderLabel}
            onBack={() => setSelectedEmailId(null)}
            onReply={handleReply}
            onForward={handleForward}
            onArchive={handleArchive}
            onSpam={handleSpam}
            onTrash={handleTrash}
            className={selectedEmailId === null ? "max-md:hidden" : undefined}
          />
        )}
      </div>

      {/* Mobile: Escrever vira FAB acima da barra inferior. */}
      {!mobileImmersive ? (
        <button
          type="button"
          onClick={handleNew}
          aria-label="Escrever e-mail"
          className="fixed right-5 z-30 flex h-12 items-center gap-2 rounded-full bg-primary px-4.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 transition-colors hover:bg-primary-dark md:hidden"
          style={{
            bottom: "calc(var(--mobile-bottom-nav-h, 0px) + env(safe-area-inset-bottom, 0px) + 1.25rem)",
          }}
        >
          <IconPlus size={18} stroke={2.2} />
          Escrever
        </button>
      ) : null}

      <EmailRulesModal
        open={rulesOpen}
        onOpenChange={setRulesOpen}
        accounts={accounts}
        customFolders={customFolders}
        defaultAccountId={selectedAccountId}
        onAccountsChange={() => {
          reloadAccounts();
          reloadCustomFolders();
        }}
      />

      <FormDialog
        open={expandedReplyId !== null}
        onOpenChange={(open) => {
          if (!open) setExpandedReplyId(null);
        }}
        title="Responder e-mail"
        size="2xl"
        className="max-h-[90vh]"
        bodyClassName="overflow-hidden p-0"
      >
        {emailDetail && expandedReplyId ? (
          <div className="h-[calc(90vh-8rem)]">
            <ComposeView
              accounts={composeAccounts.length > 0 ? composeAccounts : accounts}
              draft={buildComposeDraft(emailDetail, "reply")}
              onCancel={() => setExpandedReplyId(null)}
              onSent={handleSent}
            />
          </div>
        ) : (
          <div className="p-6 text-sm text-muted-foreground">Carregando e-mail…</div>
        )}
      </FormDialog>
    </div>
  );
}
