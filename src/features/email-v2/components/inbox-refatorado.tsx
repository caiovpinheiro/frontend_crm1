"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { IconMail } from "@tabler/icons-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/crm/page-header";
import { FormDialog } from "@/components/ui/form-dialog";
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
import { HtmlEmailFrame, decodeIfQuotedPrintable, decodeHtmlEntities } from "./html-email-frame";
import {
  buildComposeDraft,
  newComposeDraft,
  type ComposeDraft,
} from "../utils/compose-draft";

/* ------------------------------------------------------------------
   Tokens — troque apenas estes valores para aplicar a marca do sistema.
   ------------------------------------------------------------------ */
const T = {
  paper: "#F7F9FD",
  surface: "#FFFFFF",
  ink: "#1B1B33",
  ink2: "#454B63",
  muted: "#7C849B",
  line: "#E4E9F2",
  lineSoft: "#EFF3F9",
  accent: "#3B5BF0",
  accentSoft: "#ECF0FE",
  accentInk: "#1E2A78",
  amber: "#5B3BB0",
  amberSoft: "#F3EEFE",
} as const;

const BRAND_GRADIENT = "linear-gradient(135deg, #2B7FFF 0%, #6A45F0 55%, #C13BD9 100%)";
const FONT =
  "'Inter var', Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const NUM = { fontVariantNumeric: "tabular-nums" } as const;

/* ------------------------------------------------------------------ */
/* Ícones                                                              */
/* ------------------------------------------------------------------ */
interface IconProps {
  size?: number;
  stroke?: number;
  fill?: string;
}

const Ic = ({ d, size = 16, stroke = 1.6, fill = "none" }: { d: React.ReactNode } & IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {d}
  </svg>
);

const IconSearch = (p: IconProps) => (
  <Ic {...p} d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>} />
);
const IconInbox = (p: IconProps) => (
  <Ic {...p} d={<><path d="M3 12h4l2 3h6l2-3h4" /><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>} />
);
const IconSent = (p: IconProps) => <Ic {...p} d={<path d="M21 4 3 11l7 3 3 7 8-17Z" />} />;
const IconSpam = (p: IconProps) => (
  <Ic {...p} d={<><path d="M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6l-7-3Z" /><path d="M12 9v3.5" /><path d="M12 16h.01" /></>} />
);
const IconTrash = (p: IconProps) => (
  <Ic {...p} d={<><path d="M4 7h16" /><path d="M9 7V5h6v2" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" /></>} />
);
const IconFolder = (p: IconProps) => (
  <Ic {...p} d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />} />
);
const IconRules = (p: IconProps) => (
  <Ic {...p} d={<><path d="M4 6h16" /><path d="M7 12h13" /><path d="M10 18h10" /><circle cx="4" cy="12" r="1.4" /><circle cx="7" cy="18" r="1.4" /></>} />
);
const IconReply = (p: IconProps) => (
  <Ic {...p} d={<><path d="M9 7 4 12l5 5" /><path d="M4 12h9a6 6 0 0 1 6 6v1" /></>} />
);
const IconForward = (p: IconProps) => (
  <Ic {...p} d={<><path d="m15 7 5 5-5 5" /><path d="M20 12h-9a6 6 0 0 0-6 6v1" /></>} />
);
const IconArchive = (p: IconProps) => (
  <Ic {...p} d={<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></>} />
);
const IconRefresh = (p: IconProps) => (
  <Ic {...p} d={<><path d="M20 11a8 8 0 0 0-13.7-5.3L4 8" /><path d="M4 4v4h4" /><path d="M4 13a8 8 0 0 0 13.7 5.3L20 16" /><path d="M20 20v-4h-4" /></>} />
);
const IconChevron = (p: IconProps) => <Ic {...p} d={<path d="m6 9 6 6 6-6" />} />;
const IconPlus = (p: IconProps) => <Ic {...p} d={<><path d="M12 5v14" /><path d="M5 12h14" /></>} />;
const IconNote = (p: IconProps) => (
  <Ic {...p} d={<><path d="M5 4h14v10l-5 6H5z" /><path d="M19 14h-5v6" /></>} />
);

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */
const stripHtml = (s: string | null): string =>
  decodeHtmlEntities(decodeIfQuotedPrintable(s ?? ""))
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

const avatarTone = (name: string): [string, string] => {
  const tones: [string, string][] = [
    ["#E8EEFE", "#2F4FD8"],
    ["#EFEAFD", "#6035D6"],
    ["#E6F1FB", "#1F5F96"],
    ["#F7EAF8", "#9B2FB0"],
    ["#EAEDF6", "#3A4670"],
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  return tones[h % tones.length];
};

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */
interface SidebarProps {
  accounts: EmailAccount[];
  folders: EmailCustomFolder[];
  selectedAccountId?: string;
  selectedFolder: EmailFolder;
  selectedCustomFolderId: string | null;
  counts: { inbox: number; sent: number; spam: number; trash: number };
  width: number;
  onSelectAccount: (id?: string) => void;
  onSelectFolder: (folder: EmailFolder) => void;
  onSelectCustomFolder: (id: string | null) => void;
  onOpenRules: () => void;
  onRefresh: () => void;
  onNew: () => void;
}

function Sidebar({
  width,
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
  onNew,
}: SidebarProps) {
  const main = [
    { id: "INBOX", label: "Caixa de entrada", Icon: IconInbox, count: counts.inbox },
    { id: "SENT", label: "Enviados", Icon: IconSent, count: counts.sent },
    { id: "SPAM", label: "Spam", Icon: IconSpam, count: counts.spam },
    { id: "TRASH", label: "Excluídos", Icon: IconTrash, count: counts.trash, quiet: true },
  ] as const;

  const activeSystem = selectedCustomFolderId === null;

  interface RowItem {
    id: string;
    label: string;
    Icon?: React.ComponentType<IconProps>;
    count?: number;
    quiet?: boolean;
    onClick?: () => void;
  }

  const Row = ({ id, label, Icon, count, quiet, onClick }: RowItem) => {
    const active = activeSystem && selectedFolder === id;
    return (
      <button
        onClick={() => {
          if (onClick) {
            onClick();
            return;
          }
          onSelectCustomFolder(null);
          onSelectFolder(id as EmailFolder);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "7px 10px",
          borderRadius: 7,
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontSize: 13.5,
          fontWeight: active ? 600 : 450,
          color: active ? T.accentInk : T.ink2,
          background: active ? T.accentSoft : "transparent",
        }}
      >
        {Icon ? (
          <span style={{ color: active ? T.accent : T.muted, display: "flex" }}>
            <Icon size={17} />
          </span>
        ) : (
          <span style={{ color: T.muted, display: "flex" }}>
            <IconFolder size={17} />
          </span>
        )}
        <span style={{ flex: 1 }}>{label}</span>
        {count !== undefined && count > 0 ? (
          <span
            style={{
              ...NUM,
              fontSize: 12,
              fontWeight: 600,
              color: quiet ? T.muted : active ? T.accent : T.ink2,
            }}
          >
            {count}
          </span>
        ) : null}
      </button>
    );
  };

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        border: `1px solid ${T.line}`,
        borderRadius: 14,
        overflow: "hidden",
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 18,
        background: T.surface,
      }}
    >
      <button
        onClick={onNew}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          height: 36,
          borderRadius: 8,
          border: "none",
          background: BRAND_GRADIENT,
          color: "#fff",
          fontSize: 13.5,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <IconPlus size={16} /> Escrever
      </button>

      <label style={{ display: "block" }}>
        <span style={{ fontSize: 12, color: T.muted, display: "block", marginBottom: 5 }}>
          Conta
        </span>
        <div style={{ position: "relative" }}>
          <select
            value={selectedAccountId ?? "all"}
            onChange={(e) => onSelectAccount(e.target.value === "all" ? undefined : e.target.value)}
            style={{
              width: "100%",
              appearance: "none",
              height: 32,
              padding: "0 28px 0 10px",
              borderRadius: 7,
              border: `1px solid ${T.line}`,
              background: T.surface,
              fontSize: 13,
              color: T.ink,
              fontFamily: FONT,
              cursor: "pointer",
            }}
          >
            <option value="all">Todas as contas</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email}
              </option>
            ))}
          </select>
          <span
            style={{
              position: "absolute",
              right: 9,
              top: 8,
              color: T.muted,
              pointerEvents: "none",
            }}
          >
            <IconChevron size={15} />
          </span>
        </div>
      </label>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 18 }}>
        <nav style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0 }}>
          {main.map((m) => (
            <Row key={m.id} {...m} />
          ))}
        </nav>

        {folders.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <div style={{ fontSize: 12, color: T.muted, padding: "0 10px 6px" }}>Pastas</div>
            <nav style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {folders.map((f) => (
                <Row
                  key={f.id}
                  id={f.id}
                  label={f.name}
                  count={f.unreadCount}
                  quiet
                />
              ))}
            </nav>
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 1, flexShrink: 0, paddingTop: 8, borderTop: `1px solid ${T.lineSoft}` }}>
        <Row id="rules" label="Regras" Icon={IconRules} onClick={onOpenRules} />
        <button
          onClick={onRefresh}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "7px 10px",
            border: "none",
            background: "transparent",
            color: T.muted,
            fontSize: 13.5,
            cursor: "pointer",
            fontFamily: FONT,
            textAlign: "left",
          }}
        >
          <IconRefresh size={17} /> Atualizar
        </button>
      </div>
    </aside>
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
  const [hover, setHover] = useState(false);
  const fromName = m.fromName || m.fromAddress;
  const [bg, fg] = avatarTone(fromName);
  const showCheck = hover || selected;

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onOpen}
      onDoubleClick={onDoubleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      style={{
        position: "relative",
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: dense ? "8px 14px 8px 16px" : "11px 14px 11px 16px",
        cursor: "pointer",
        background: active ? T.accentSoft : selected ? T.lineSoft : hover ? "#F7F5F2" : "transparent",
        borderBottom: `1px solid ${T.lineSoft}`,
        outline: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: !m.isRead ? BRAND_GRADIENT : "transparent",
        }}
      />

      <div style={{ width: 28, flexShrink: 0, marginTop: 1 }}>
        {showCheck ? (
          <input
            type="checkbox"
            checked={selected}
            onClick={(e) => e.stopPropagation()}
            onChange={onToggle}
            style={{ width: 15, height: 15, accentColor: T.accent, cursor: "pointer", margin: "5px 0 0 3px" }}
          />
        ) : m.contact?.avatarUrl ? (
          <img
            src={m.contact.avatarUrl}
            alt=""
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              objectFit: "cover",
            }}
          />
        ) : (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 26,
              height: 26,
              borderRadius: 7,
              background: bg,
              color: fg,
              fontSize: 10.5,
              fontWeight: 700,
              letterSpacing: 0.2,
            }}
          >
            {initials(fromName)}
          </span>
        )}
      </div>

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: !m.isRead ? 650 : 500,
              color: !m.isRead ? T.ink : T.ink2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {fromName}
          </span>
          <span
            style={{
              ...NUM,
              marginLeft: "auto",
              fontSize: 11.5,
              color: T.muted,
              flexShrink: 0,
            }}
          >
            {shortTime(m.receivedAt)}
          </span>
        </div>

        <div
          style={{
            fontSize: 13.5,
            fontWeight: !m.isRead ? 600 : 450,
            color: !m.isRead ? T.ink : T.ink2,
            marginTop: 1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {decodeHtmlEntities(decodeIfQuotedPrintable(m.subject ?? "")) || "(sem assunto)"}
        </div>

        {!dense && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginTop: 2,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                color: T.muted,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {stripHtml(m.bodyText)}
            </span>
          </div>
        )}
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
  onRefresh: () => void;
  total?: number;
  search: string;
  onSearch: (value: string) => void;
  unreadOnly: boolean;
  onUnreadOnly: (value: boolean) => void;
  width: number;
  onArchive: () => void;
  onSpam: () => void;
  onTrash: () => void;
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
  onRefresh,
  total,
  search,
  onSearch,
  unreadOnly,
  onUnreadOnly,
  width,
  onArchive,
  onSpam,
  onTrash,
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
      style={{
        width,
        flexShrink: 0,
        border: `1px solid ${T.line}`,
        borderRadius: 14,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        background: T.surface,
      }}
    >
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: T.muted }}>
            <IconSearch size={16} />
          </span>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar por remetente, assunto ou conteúdo"
            style={{
              width: "100%",
              height: 36,
              padding: "0 10px 0 32px",
              borderRadius: 10,
              border: "1px solid transparent",
              background: "#F1F4FB",
              fontSize: 13,
              color: T.ink,
              fontFamily: FONT,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "10px 0 9px",
          }}
        >
          {chips.map(({ id, label, count }) => {
            const on =
              id === "nao-lidos" ? unreadOnly : id === "todos" ? !unreadOnly && filter === "todos" : filter === id && !unreadOnly;
            return (
              <button
                key={id}
                onClick={() => {
                  if (id === "nao-lidos") {
                    onUnreadOnly(!unreadOnly);
                    setFilter("todos");
                  } else {
                    onUnreadOnly(false);
                    setFilter(id);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: on ? 600 : 500,
                  fontFamily: FONT,
                  cursor: "pointer",
                  border: "none",
                  background: on ? T.accentSoft : "transparent",
                  color: on ? T.accentInk : T.muted,
                }}
              >
                {label}
                <span
                  style={{
                    ...NUM,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 15,
                    height: 15,
                    padding: "0 3px",
                    borderRadius: 999,
                    fontSize: 10,
                    fontWeight: 600,
                    color: on ? "#fff" : T.ink2,
                    background: on ? T.accent : T.lineSoft,
                  }}
                >
                  {count}
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setDense((d) => !d)}
            title={dense ? "Mostrar prévia" : "Ocultar prévia"}
            style={{
              marginLeft: "auto",
              border: "none",
              background: "transparent",
              color: T.muted,
              cursor: "pointer",
              fontSize: 12,
              fontFamily: FONT,
            }}
          >
            {dense ? "Confortável" : "Compacto"}
          </button>
          <button
            title="Atualizar"
            onClick={onRefresh}
            style={{ border: "none", background: "transparent", color: T.muted, cursor: "pointer", display: "flex" }}
          >
            <IconRefresh size={16} />
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          height: 36,
          padding: "0 14px",
          overflowX: "auto",
          flexWrap: "nowrap",
          borderTop: `1px solid ${T.lineSoft}`,
          borderBottom: `1px solid ${T.line}`,
          background: anySelected ? T.accentSoft : T.paper,
        }}
      >
        {anySelected ? (
          <>
            <span style={{ fontSize: 12.5, color: T.accentInk, fontWeight: 600, marginRight: 6 }}>
              {selected.length} selecionados
            </span>
            {[
              [IconArchive, "Arquivar", onArchive] as const,
              [IconSpam, "Spam", onSpam] as const,
              [IconTrash, "Excluir", onTrash] as const,
            ].map(([I, label, action]) => (
              <button
                key={label}
                onClick={action}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  border: "none",
                  background: "transparent",
                  color: T.accentInk,
                  fontSize: 12.5,
                  fontFamily: FONT,
                  cursor: "pointer",
                  padding: "4px 6px",
                }}
              >
                <I size={15} /> {label}
              </button>
            ))}
            <button
              onClick={() => setSelected([])}
              style={{
                marginLeft: "auto",
                border: "none",
                background: "transparent",
                color: T.ink2,
                fontSize: 12.5,
                fontFamily: FONT,
                cursor: "pointer",
              }}
            >
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 12.5, color: T.ink2, fontWeight: 600 }}>{folderLabel}</span>
            <span style={{ ...NUM, fontSize: 12.5, color: T.muted, marginLeft: 8 }}>
              {folderUnread} não lidos · {total ?? emails.length} total
            </span>
          </>
        )}
      </div>

      <div ref={listRef} style={{ overflowY: "auto", flex: 1 }}>
        {loading && emails.length === 0 && (
          <div style={{ padding: 48, textAlign: "center", color: T.muted, fontSize: 13 }}>
            Carregando e-mails…
          </div>
        )}
        {!loading && groups.length === 0 && (
          <div style={{ padding: "48px 24px", textAlign: "center" }}>
            <p style={{ fontSize: 14, color: T.ink2, margin: 0, fontWeight: 600 }}>Nada por aqui</p>
            <p style={{ fontSize: 13, color: T.muted, margin: "6px 0 0", lineHeight: 1.5 }}>
              Ajuste a busca ou volte para o filtro Todos.
            </p>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 1,
                padding: "6px 16px",
                fontSize: 11.5,
                color: T.muted,
                background: "rgba(251,250,248,.94)",
                backdropFilter: "blur(6px)",
                borderBottom: `1px solid ${T.lineSoft}`,
              }}
            >
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
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onSpam: () => void;
  onTrash: () => void;
}

function Reader({ email, loading, folder, onReply, onForward, onArchive, onSpam, onTrash }: ReaderProps) {
  const [note, setNote] = useState("");
  const [noteOpen, setNoteOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [email?.id]);

  if (loading) {
    return (
      <section style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", background: T.surface }}>
        <span style={{ color: T.muted, fontSize: 13 }}>Carregando e-mail…</span>
      </section>
    );
  }

  if (!email) {
    return (
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: T.surface,
          color: T.muted,
          fontSize: 13,
        }}
      >
        Selecione um e-mail para ler
      </section>
    );
  }

  const fromName = email.fromName || email.fromAddress;
  const [bg, fg] = avatarTone(fromName);

  const Action = ({
    Icon,
    label,
    primary,
    onClick,
  }: {
    Icon: React.ComponentType<IconProps>;
    label: string;
    primary?: boolean;
    onClick?: () => void;
  }) => (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 32,
        padding: primary ? "0 14px" : "0 10px",
        borderRadius: 7,
        fontSize: 13,
        fontFamily: FONT,
        fontWeight: primary ? 600 : 500,
        cursor: "pointer",
        border: primary ? "none" : `1px solid ${T.line}`,
        background: primary ? T.accent : T.surface,
        color: primary ? "#fff" : T.ink2,
      }}
    >
      <Icon size={15} />
      {label}
    </button>
  );

  const decodedBodyText = decodeHtmlEntities(decodeIfQuotedPrintable(email.bodyText ?? ""));
  const hasHtml = Boolean(email.bodyHtml?.trim());
  const hasText = Boolean(decodedBodyText.trim());

  return (
    <section style={{ flex: "1 0 520px", display: "flex", flexDirection: "column", minWidth: 520, border: `1px solid ${T.line}`, borderRadius: 14, overflow: "hidden", background: T.surface }}>
      <header
        style={{
          padding: "14px 28px 12px",
          borderBottom: `1px solid ${T.line}`,
          background: T.surface,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              lineHeight: 1.35,
              fontWeight: 650,
              color: T.ink,
              letterSpacing: -0.2,
              flex: 1,
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {decodeHtmlEntities(decodeIfQuotedPrintable(email.subject ?? "")) || "(sem assunto)"}
          </h1>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0, justifyContent: "flex-end" }}>
            <Action Icon={IconReply} label="Responder" primary onClick={onReply} />
            <Action Icon={IconForward} label="Encaminhar" onClick={onForward} />
            <Action Icon={IconArchive} label="Arquivar" onClick={onArchive} />
            <Action Icon={IconTrash} label="Excluir" onClick={onTrash} />
            <Action Icon={IconSpam} label={folder === "SPAM" ? "Não é spam" : "Spam"} onClick={onSpam} />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 30,
              height: 30,
              borderRadius: 8,
              background: bg,
              color: fg,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {initials(fromName)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, color: T.ink, fontWeight: 600 }}>
              {fromName} <span style={{ fontWeight: 400, color: T.muted }}>&lt;{email.fromAddress}&gt;</span>
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 1 }}>
              para {email.toAddress} · <span style={NUM}>{fullDate(email.receivedAt)}</span>
            </div>
          </div>
          <button
            onClick={() => setNoteOpen((o) => !o)}
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 6,
              border: `1px solid ${T.line}`,
              background: T.surface,
              borderRadius: 7,
              height: 30,
              padding: "0 10px",
              fontSize: 12.5,
              color: T.ink2,
              fontFamily: FONT,
              cursor: "pointer",
            }}
          >
            <IconNote size={15} />
            {note ? "Anotação interna (1)" : "Anotar"}
          </button>
        </div>

        {noteOpen && (
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${T.amberSoft}`,
              background: T.amberSoft,
              borderRadius: 8,
              padding: 10,
            }}
          >
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Visível só para o time. Ex.: aguardando retorno do jurídico."
              rows={2}
              style={{
                width: "100%",
                border: "none",
                background: "transparent",
                resize: "vertical",
                fontSize: 13,
                fontFamily: FONT,
                color: T.ink,
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </header>

      <div ref={ref} style={{ flex: 1, overflowY: "auto", minHeight: 0, padding: "24px 28px 40px" }}>
        <div style={{ maxWidth: 660, minWidth: 0, wordBreak: "break-word", overflowWrap: "anywhere" }}>
          {hasHtml && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 12.5,
                color: T.ink2,
                background: T.paper,
                border: `1px solid ${T.line}`,
                borderRadius: 8,
                padding: "8px 12px",
                marginBottom: 18,
              }}
            >
              Imagens e conteúdo externo serão carregados abaixo.
            </div>
          )}

          {hasHtml ? (
            <HtmlEmailFrame html={email.bodyHtml ?? ""} />
          ) : hasText ? (
            decodedBodyText
              .split(/\n{2,}/)
              .map((p, i) => (
                <p
                  key={i}
                  style={{
                    margin: "0 0 14px",
                    fontSize: 14.5,
                    lineHeight: 1.65,
                    color: T.ink2,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {p}
                </p>
              ))
          ) : (
            <p style={{ color: T.muted, fontSize: 14.5 }}>(sem conteúdo)</p>
          )}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${T.line}`, padding: "12px 28px 16px", background: T.paper }}>
        <button
          onClick={onReply}
          style={{
            width: "100%",
            maxWidth: 660,
            textAlign: "left",
            height: 40,
            padding: "0 14px",
            borderRadius: 10,
            border: `1px solid ${T.line}`,
            background: T.surface,
            color: T.muted,
            fontSize: 13.5,
            fontFamily: FONT,
            cursor: "pointer",
          }}
        >
          Responder para {fromName}
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Resize handle                                                         */
/* ------------------------------------------------------------------ */
function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [active, setActive] = useState(false);
  const [hover, setHover] = useState(false);
  const startX = useRef(0);
  const cbRef = useRef(onResize);
  useEffect(() => {
    cbRef.current = onResize;
  }, [onResize]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    setActive(true);
    startX.current = e.clientX;
    e.preventDefault();
  }, []);

  useEffect(() => {
    if (!active) return;
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - startX.current;
      startX.current = e.clientX;
      cbRef.current(delta);
    };
    const onUp = () => setActive(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [active]);

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 8,
        flexShrink: 0,
        cursor: "col-resize",
        alignSelf: "stretch",
        display: "flex",
        justifyContent: "center",
        background: active || hover ? "rgba(0,0,0,0.04)" : "transparent",
        transition: active ? "none" : "background 120ms ease",
      }}
    >
      <div
        style={{
          width: 2,
          height: "100%",
          background: active || hover ? T.line : "transparent",
          borderRadius: 1,
          transition: active ? "none" : "background 120ms ease",
        }}
      />
    </div>
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
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [listWidth, setListWidth] = useState(392);
  const minSidebar = 180;
  const maxSidebar = 360;
  const minList = 280;
  const maxList = 600;

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

  const refreshAll = useCallback(async () => {
    const results = await Promise.all(accounts.map((a) => sync(a.id).catch(() => ({ synced: 0 }))));
    const synced = results.reduce((sum, r) => sum + (r.synced ?? 0), 0);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    refreshEmails();
    reloadAccounts();
    reloadCustomFolders();
    if (synced > 0) toast.success(`${synced} e-mail${synced > 1 ? "s" : ""} sincronizado${synced > 1 ? "s" : ""}.`);
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

  const composeAccounts = selectedAccountId
    ? accounts.filter((a) => a.id === selectedAccountId)
    : accounts;

  if (accountsLoading && accounts.length === 0) {
    return (
      <div
        style={{
          fontFamily: FONT,
          color: T.ink,
          background: T.paper,
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span style={{ color: T.muted, fontSize: 13 }}>Carregando contas…</span>
      </div>
    );
  }

  return (
    <div
      style={{
        fontFamily: FONT,
        color: T.ink,
        background: T.paper,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <PageHeader icon={<IconMail size={22} />} title="E-mail" className="rounded-none border-0 bg-transparent shadow-none" />

      <div style={{ display: "flex", flex: 1, minHeight: 0, overflowX: "auto", padding: 12, background: T.paper }}>
        <Sidebar
          width={sidebarWidth}
          accounts={accounts}
          folders={customFolders}
          selectedAccountId={selectedAccountId}
          selectedFolder={selectedFolder}
          selectedCustomFolderId={selectedCustomFolderId}
          counts={folderCounts}
          onSelectAccount={(id) => {
            setSelectedAccountId(id);
            setSelectedEmailId(null);
            setSelected([]);
          }}
          onSelectFolder={handleSelectFolder}
          onSelectCustomFolder={handleSelectCustomFolder}
          onOpenRules={() => setRulesOpen(true)}
          onRefresh={refreshAll}
          onNew={handleNew}
        />

        <ResizeHandle
          onResize={(delta) =>
            setSidebarWidth((w) => Math.max(minSidebar, Math.min(maxSidebar, w + delta)))
          }
        />

        {!composing && (
          <List
            width={listWidth}
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
            onRefresh={refreshAll}
            total={pagination?.total}
            search={search}
            onSearch={setSearch}
            unreadOnly={unreadOnly}
            onUnreadOnly={setUnreadOnly}
            onOpenReply={handleOpenReply}
            onArchive={handleArchive}
            onSpam={handleSpam}
            onTrash={handleTrash}
          />
        )}

        {!composing && (
          <ResizeHandle
            onResize={(delta) =>
              setListWidth((w) => Math.max(minList, Math.min(maxList, w + delta)))
            }
          />
        )}

        {composing ? (
          <div style={{ flex: "1 0 720px", minWidth: 720, borderRadius: 14, overflow: "hidden" }}>
            <ComposeView
              accounts={composeAccounts.length > 0 ? composeAccounts : accounts}
              draft={composeDraft}
              onCancel={() => setComposing(false)}
              onSent={handleSent}
            />
          </div>
        ) : (
          <Reader
            email={emailDetail}
            loading={detailLoading}
            folder={selectedFolder}
            onReply={handleReply}
            onForward={handleForward}
            onArchive={handleArchive}
            onSpam={handleSpam}
            onTrash={handleTrash}
          />
        )}
      </div>

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
