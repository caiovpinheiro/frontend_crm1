"use client";

import * as React from "react";
import { IconArrowLeft, IconExternalLink, IconNote, IconShield, IconUser } from "@tabler/icons-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { IdentityAvatar } from "@/components/crm/identity-avatar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

import type { EmailDetail } from "../api/types";
import {
  isSecurityAlertEmail,
  parseSecurityAlert,
  type SecurityActivity,
} from "../lib/security-alert";
import { formatFullDate } from "../utils";
import { HtmlEmailFrame, decodeIfQuotedPrintable } from "./html-email-frame";

function formatPanelDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return formatFullDate(dateStr);
  }
}

// ── SVG icons (DS v2 reference) ────────────────────────────────────────────
const IcoReply = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 17 4 12l5-5"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/>
  </svg>
);
const IcoForward = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 17 5-5-5-5"/><path d="M4 18v-2a4 4 0 0 1 4-4h12"/>
  </svg>
);
const IcoTrash = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>
  </svg>
);
const IcoMail = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-20">
    <rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/>
  </svg>
);

// ── Helper ──────────────────────────────────────────────────────────────────
function getInitials(name: string | null, email: string): string {
  const src = name ?? email;
  const parts = src.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}


// ── Componente ──────────────────────────────────────────────────────────────
interface Props {
  email: EmailDetail | null;
  loading: boolean;
  onBack?: () => void;
  onReply?: () => void;
  onForward?: () => void;
  onDelete?: () => void;
}

export function EmailReader({ email, loading, onBack, onReply, onForward, onDelete }: Props) {
  if (loading || !email) {
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col">
        {onBack ? <ReaderBackBar onBack={onBack} /> : null}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
          {loading ? (
            <span className="animate-pulse text-sm">Carregando…</span>
          ) : (
            <>
              <IcoMail />
              <p className="text-[13px]">Selecione uma mensagem para lê-la.</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const security = isSecurityAlertEmail(email);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col">
      {onBack ? <ReaderBackBar onBack={onBack} /> : null}

      <div className="flex min-w-0 shrink-0 flex-col gap-3 border-b border-border px-5 pt-5 pb-4">
        <div className="flex min-w-0 items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-bold tracking-normal break-words [overflow-wrap:anywhere] line-clamp-3 text-foreground">
            {email.subject ?? "(sem assunto)"}
          </h2>
          <div className="flex shrink-0 items-center gap-1.5">
            <IconBtn onClick={onReply} label="Responder"><IcoReply /></IconBtn>
            <IconBtn onClick={onForward} label="Encaminhar"><IcoForward /></IconBtn>
            <IconBtn onClick={onDelete} label="Excluir" danger><IcoTrash /></IconBtn>
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 rounded-3xl bg-panel p-5 text-panel-foreground">
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <IdentityAvatar
              name={email.fromName}
              seed={email.fromAddress}
              initials={getInitials(email.fromName, email.fromAddress)}
              size="lg"
              online={!!email.contact}
            />
            <div className="min-w-0 flex-1">
              <p className="break-words text-lg font-bold tracking-normal [overflow-wrap:anywhere]">
                {email.fromName ?? email.fromAddress}
              </p>
              <p className="break-all font-mono text-xs text-panel-muted">
                {email.fromAddress}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                email.folder === "TRASH"
                  ? "bg-destructive/20 text-destructive-foreground"
                  : email.folder === "SENT"
                    ? "bg-success text-success-foreground"
                    : "bg-accent text-accent-foreground",
              )}
            >
              {email.folder === "SENT" ? "Enviado" : email.folder === "TRASH" ? "Excluído" : "Recebido"}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-2">
            <PanelField label="Para" value={email.toAddress?.trim() || "—"} mono />
            <PanelField label="Recebido" value={formatPanelDate(email.receivedAt)} />
            {email.contact ? (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs text-panel-muted">Contato</span>
                <a
                  href={`/contacts/${email.contact.id}`}
                  className="inline-flex min-w-0 items-center gap-1 truncate font-medium text-panel-foreground hover:underline"
                >
                  <IconUser size={12} className="shrink-0" />
                  <span className="truncate">{email.contact.name}</span>
                  <IconExternalLink size={10} className="shrink-0 opacity-60" />
                </a>
              </div>
            ) : null}
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-panel-border">
            <div
              className={cn(
                "h-full rounded-full",
                email.folder === "TRASH" ? "w-1/4 bg-accent" : "w-2/3 bg-primary",
              )}
            />
          </div>
        </aside>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <EmailAnnotation emailId={email.id} />
        {security ? <SecurityAlertCard email={email} /> : null}
        <div className="rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-4 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
          {email.bodyHtml ? (
            <HtmlEmailFrame html={email.bodyHtml} />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-[14px] leading-[1.7]">
              {email.bodyText ? decodeIfQuotedPrintable(email.bodyText) : "(sem conteúdo)"}
            </pre>
          )}
        </div>
      </div>

      <div className="flex flex-shrink-0 items-center gap-2 border-t-2 border-[var(--glass-border)] px-5 py-4">
        <button
          onClick={onReply}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[13px] font-medium text-primary-foreground transition-colors hover:bg-primary-dark"
        >
          <IcoReply /> Responder
        </button>
        <button
          onClick={onForward}
          className="inline-flex items-center gap-1.5 font-display font-bold text-[13px] px-4 py-2 rounded-full text-[var(--text-secondary)] hover:bg-black/5 transition-colors"
        >
          <IcoForward /> Encaminhar
        </button>
      </div>
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────
function ReaderBackBar({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex shrink-0 items-center border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-2.5 md:hidden">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)]"
      >
        <IconArrowLeft size={16} stroke={2} />
        Voltar
      </button>
    </div>
  );
}

function PanelField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-xs text-panel-muted">{label}</span>
      <span
        className={cn(
          "min-w-0 font-medium break-words [overflow-wrap:anywhere]",
          mono && "font-mono text-xs",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function SecurityAlertCard({ email }: { email: EmailDetail }) {
  const parsed = React.useMemo(() => parseSecurityAlert(email), [email]);
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState<Record<number, "open" | "ended" | "safe">>({});

  function mark(index: number, next: "ended" | "safe") {
    setStatus((prev) => ({ ...prev, [index]: next }));
    toast.success(next === "ended" ? "Sessão encerrada." : "Atividade marcada como segura.");
  }

  return (
    <>
      <div className="mb-5 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow)]">
        <div className="flex items-start gap-3 px-4 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-warning,#d97706)]/15 text-[var(--color-warning,#d97706)]">
            <IconShield size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[15px] font-extrabold text-[var(--text-primary)]">
              Alerta de segurança
            </p>
            <p className="mt-1 font-body text-[13px] leading-relaxed text-[var(--text-secondary)]">
              Detectamos uma nova atividade em <strong>{parsed.appName}</strong> na conta{" "}
              <strong>{parsed.accountEmail}</strong>.
            </p>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="mt-3 font-display text-[13px] font-semibold text-[var(--brand-primary)] hover:underline"
            >
              Verificar atividade de segurança
            </button>
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>Atividade de segurança</DialogTitle>
            <DialogDescription>
              Sessões recentes vinculadas a {parsed.accountEmail}. As ações ficam só nesta tela.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-3">
            {parsed.activities.map((activity, index) => (
              <SecurityActivityRow
                key={`${activity.device}-${index}`}
                activity={activity}
                state={status[index] ?? "open"}
                onEnd={() => mark(index, "ended")}
                onSafe={() => mark(index, "safe")}
              />
            ))}
          </ul>
          <DialogFooter>
            <ButtonGlass type="button" variant="glass" size="sm" onClick={() => setOpen(false)}>
              Fechar
            </ButtonGlass>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SecurityActivityRow({
  activity,
  state,
  onEnd,
  onSafe,
}: {
  activity: SecurityActivity;
  state: "open" | "ended" | "safe";
  onEnd: () => void;
  onSafe: () => void;
}) {
  return (
    <li className="rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-3 py-3">
      <p className="font-display text-[13px] font-bold text-[var(--text-primary)]">{activity.device}</p>
      <p className="mt-0.5 font-body text-[12px] text-[var(--text-muted)]">
        {activity.location}
        {activity.time ? ` · ${formatFullDate(activity.time)}` : ""}
      </p>
      {state === "ended" ? (
        <p className="mt-2 font-display text-[12px] font-semibold text-[var(--color-danger,#e11d48)]">
          Sessão encerrada
        </p>
      ) : state === "safe" ? (
        <p className="mt-2 font-display text-[12px] font-semibold text-[var(--color-success,#16a34a)]">
          Marcada como segura
        </p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <ButtonGlass type="button" variant="danger" size="sm" onClick={onEnd}>
            Encerrar sessão
          </ButtonGlass>
          <ButtonGlass type="button" variant="glass" size="sm" onClick={onSafe}>
            Marcar como segura
          </ButtonGlass>
        </div>
      )}
    </li>
  );
}

function noteKey(id: string) {
  return `email-v2:note:${id}`;
}

function EmailAnnotation({ emailId }: { emailId: string }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(noteKey(emailId)) ?? "";
      setValue(stored);
      setOpen(stored.length > 0);
      setSaved(false);
    } catch {
      setValue("");
    }
  }, [emailId]);

  function persist(next: string) {
    setValue(next);
    try {
      if (next.trim()) localStorage.setItem(noteKey(emailId), next);
      else localStorage.removeItem(noteKey(emailId));
      setSaved(true);
    } catch {
      /* ignore quota */
    }
  }

  return (
    <div className="mb-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3 py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <IconNote size={15} className="text-[var(--brand-primary)]" />
        <span className="flex-1 font-display text-[12.5px] font-bold text-[var(--text-primary)]">
          Anotação interna
        </span>
        <span className="font-display text-[11px] font-semibold text-[var(--brand-primary)]">
          {open ? "Ocultar" : value.trim() ? "Editar" : "Criar"}
        </span>
      </button>
      {open ? (
        <>
          <textarea
            value={value}
            onChange={(e) => persist(e.target.value)}
            placeholder="Nota só para a equipe — não vai no e-mail."
            rows={3}
            className="mt-2 w-full resize-none rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-2.5 py-2 font-body text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--brand-primary)]"
          />
          {saved && value.trim() ? (
            <p className="mt-1 font-body text-[11px] text-[var(--text-muted)]">Salva neste navegador.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
  danger = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={[
        "w-[34px] h-[34px] rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] flex items-center justify-center transition-all",
        danger
          ? "text-[var(--text-secondary)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)] hover:bg-[var(--glass-bg-strong)]"
          : "text-[var(--text-secondary)] hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)] hover:bg-[var(--glass-bg-strong)]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
