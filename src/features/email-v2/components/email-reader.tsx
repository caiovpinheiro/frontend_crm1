"use client";

import * as React from "react";
import { IconArrowLeft, IconExternalLink, IconShield, IconUser } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
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
  AVATAR_TONE_CLASS,
  avatarToneFromAddress,
  isSecurityAlertEmail,
  parseSecurityAlert,
  type SecurityActivity,
} from "../lib/security-alert";
import { formatFullDate } from "../utils";
import { HtmlEmailFrame, decodeIfQuotedPrintable } from "./html-email-frame";

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
    <div className="flex h-full min-h-0 flex-col">
      {onBack ? <ReaderBackBar onBack={onBack} /> : null}

      <div className="flex-shrink-0 border-b border-[var(--glass-border-subtle,var(--glass-border))] px-5 pb-4 pt-5">
        <h2 className="mb-3 font-display text-[18px] font-extrabold leading-snug tracking-[-0.2px] text-[var(--text-primary)]">
          {email.subject ?? "(sem assunto)"}
        </h2>

        {/* Meta: avatar + remetente + ações */}
        <div className="flex items-center gap-3">
          {/* Avatar com iniciais */}
          <AvatarInitials name={email.fromName} email={email.fromAddress} />

          {/* Nome + endereço */}
          <div className="flex-1 min-w-0">
            <p className="font-display font-bold text-[13.5px] text-[var(--text-primary)] leading-tight truncate">
              {email.fromName ?? email.fromAddress}
            </p>
            <p className="text-[12px] text-[var(--text-muted)] leading-tight truncate">
              {email.fromName
                ? `${email.fromAddress} · para ${email.toAddress}`
                : `para ${email.toAddress}`}
            </p>
          </div>

          {/* Data */}
          <span className="text-[11.5px] text-[var(--text-muted)] shrink-0 hidden lg:block">
            {formatFullDate(email.receivedAt)}
          </span>

          {/* Ações */}
          <div className="flex gap-1.5 shrink-0">
            <IconBtn onClick={onReply} label="Responder"><IcoReply /></IconBtn>
            <IconBtn onClick={onForward} label="Encaminhar"><IcoForward /></IconBtn>
            <IconBtn onClick={onDelete} label="Excluir" danger><IcoTrash /></IconBtn>
          </div>
        </div>

        {/* Linha: contato vinculado */}
        {email.contact && (
          <div className="flex items-center gap-1.5 mt-2.5">
            <span className="text-[11px] text-[var(--text-muted)]">Contato:</span>
            <a
              href={`/contacts/${email.contact.id}`}
              className="inline-flex items-center gap-1 text-[12px] text-[var(--brand-primary)] hover:underline font-medium"
            >
              <IconUser size={12} />
              {email.contact.name}
              <IconExternalLink size={10} className="opacity-60" />
            </a>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 text-[14px] leading-[1.7] text-[var(--text-secondary)]">
        {security ? <SecurityAlertCard email={email} /> : null}
        {email.bodyHtml ? (
          <HtmlEmailFrame html={email.bodyHtml} />
        ) : (
          <pre className="whitespace-pre-wrap font-sans text-[14px] leading-[1.7]">
            {email.bodyText ? decodeIfQuotedPrintable(email.bodyText) : "(sem conteúdo)"}
          </pre>
        )}
      </div>

      {/* ── Rodapé ───────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-5 py-4 border-t border-[var(--glass-border-subtle,var(--glass-border))] flex-shrink-0">
        <button
          onClick={onReply}
          className="inline-flex items-center gap-1.5 font-display font-bold text-[13px] px-4 py-2 rounded-full bg-[var(--brand-primary)] text-white shadow-[0_4px_14px_rgba(91,111,245,0.35)] hover:bg-[var(--brand-primary-dark,#3d52e8)] hover:-translate-y-px transition-all"
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

function AvatarInitials({ name, email }: { name: string | null; email: string }) {
  const initials = getInitials(name, email);
  const tone = avatarToneFromAddress(email);
  return (
    <span
      className={cn(
        "flex h-[42px] w-[42px] shrink-0 select-none items-center justify-center rounded-full font-display text-[14px] font-bold text-white",
        AVATAR_TONE_CLASS[tone],
      )}
    >
      {initials}
    </span>
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
