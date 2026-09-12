"use client";

import * as React from "react";
import {
  IconLoader2,
  IconSend,
  IconX,
  IconPaperclip,
} from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { EmailRichEditor, type EmailRichEditorHandle } from "./email-rich-editor";
import { sendEmail } from "../api/emails";
import type { EmailAccount } from "../api/types";
import { isBlankEmailBody, parseEmailAddresses } from "../lib/parse-addresses";
import type { ComposeDraft, ComposeMode } from "../utils/compose-draft";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accounts: EmailAccount[];
  draft?: ComposeDraft;
  onSent?: () => void;
}

const MODE_TITLES: Record<ComposeMode, string> = {
  new: "Novo e-mail",
  reply: "Responder",
  forward: "Encaminhar",
};

export function ComposeModal({
  open,
  onOpenChange,
  accounts,
  draft,
  onSent,
}: Props) {
  const [accountId, setAccountId] = React.useState("");
  const [to, setTo] = React.useState("");
  const [cc, setCc] = React.useState("");
  const [bcc, setBcc] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [bodyText, setBodyText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [showCc, setShowCc] = React.useState(false);
  const [showBcc, setShowBcc] = React.useState(false);
  const [editorKey, setEditorKey] = React.useState(0);
  const editorRef = React.useRef<EmailRichEditorHandle>(null);

  const mode = draft?.mode ?? "new";
  const title = MODE_TITLES[mode];
  const draftKey = `${draft?.mode ?? "new"}|${draft?.accountId ?? ""}|${draft?.to ?? ""}|${draft?.subject ?? ""}|${draft?.bodyHtml ?? ""}`;

  React.useEffect(() => {
    if (!open) return;
    setAccountId(draft?.accountId ?? "");
    setTo(draft?.to ?? "");
    setCc(draft?.cc ?? "");
    setBcc(draft?.bcc ?? "");
    setSubject(draft?.subject ?? "");
    setBodyHtml(draft?.bodyHtml ?? "");
    setBodyText("");
    setErrors({});
    setShowCc(Boolean(draft?.cc));
    setShowBcc(Boolean(draft?.bcc));
    setEditorKey((k) => k + 1);
  }, [open, draftKey, draft?.accountId, draft?.to, draft?.cc, draft?.bcc, draft?.subject, draft?.bodyHtml]);

  React.useEffect(() => {
    if (!open || accountId) return;
    const fallback = draft?.accountId ?? accounts[0]?.id;
    if (fallback) setAccountId(fallback);
  }, [open, accountId, accounts, draft?.accountId]);

  function resetAndClose() {
    setTo("");
    setCc("");
    setBcc("");
    setSubject("");
    setBodyHtml("");
    setBodyText("");
    setErrors({});
    setShowCc(false);
    setShowBcc(false);
    onOpenChange(false);
  }

  async function handleSend() {
    const live = editorRef.current?.getContent();
    const html = live?.html || bodyHtml;
    const text = live?.text || bodyText;
    const recipients = parseEmailAddresses(to);
    const errs: Record<string, string> = {};
    if (!accountId) errs.accountId = "Selecione uma conta.";
    if (recipients.length === 0) errs.to = "Informe um destinatário válido.";
    if (mode === "new" && isBlankEmailBody(html, text)) {
      errs.send = "Escreva o corpo da mensagem antes de enviar.";
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    try {
      await sendEmail({
        accountId,
        to: recipients.join(", "),
        subject: subject.trim() || "(sem assunto)",
        bodyText: text,
        bodyHtml: html,
        inReplyTo: draft?.inReplyTo,
      });
      onSent?.();
      resetAndClose();
    } catch (err) {
      setErrors({ send: err instanceof Error ? err.message : "Erro ao enviar." });
    } finally {
      setLoading(false);
    }
  }

  const fromAccount = accounts.find((a) => a.id === accountId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!loading) { if (!o) resetAndClose(); else onOpenChange(o); } }}>
      <DialogContent
        size="xl"
        panelClassName="w-[min(780px,96vw)] max-h-[min(90vh,680px)] min-h-[480px]"
        bodyClassName="flex min-h-0 flex-1 flex-col p-0 gap-0"
      >
        {/* Barra de título */}
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="font-display text-[15px] font-bold text-[var(--text-primary)]">
              {title}
            </h3>
            {fromAccount ? (
              <span className="truncate rounded-full bg-[var(--glass-bg-strong)] px-2.5 py-0.5 font-body text-[11px] text-[var(--text-secondary)]">
                {fromAccount.email}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            disabled={loading}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
            aria-label="Fechar"
          >
            <IconX size={16} />
          </button>
        </div>

        {/* Campos */}
        <div className="shrink-0 divide-y divide-[var(--glass-border)] border-b border-[var(--glass-border)]">
          {accounts.length > 1 ? (
            <HeaderField label="De">
              <DropdownGlass
                options={accounts.map((a) => ({ value: a.id, label: a.email }))}
                value={accountId}
                onValueChange={setAccountId}
                matchTriggerWidth
                triggerClassName="h-8 border-0 bg-transparent shadow-none"
              />
              {errors.accountId ? (
                <span className="text-xs text-destructive">{errors.accountId}</span>
              ) : null}
            </HeaderField>
          ) : null}

          <HeaderField label="Para">
            <Input
              placeholder="destinatario@email.com"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                if (errors.to) setErrors((p) => { const n = { ...p }; delete n.to; return n; });
              }}
              autoFocus={mode !== "new" || Boolean(draft?.to)}
              className="h-8 border-0 bg-transparent px-0 font-body text-[13px] shadow-none focus-visible:ring-0"
            />
            <div className="flex shrink-0 items-center gap-1">
              {!showCc ? (
                <MetaToggle onClick={() => setShowCc(true)}>CC</MetaToggle>
              ) : null}
              {!showBcc ? (
                <MetaToggle onClick={() => setShowBcc(true)}>CCO</MetaToggle>
              ) : null}
            </div>
            {errors.to ? (
              <span className="shrink-0 text-xs text-destructive">{errors.to}</span>
            ) : null}
          </HeaderField>

          {showCc ? (
            <HeaderField label="CC">
              <Input
                placeholder="copia@email.com"
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                className="h-8 border-0 bg-transparent px-0 font-body text-[13px] shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => { setShowCc(false); setCc(""); }}
                className="shrink-0 text-[var(--text-muted)] hover:text-destructive"
              >
                <IconX size={13} />
              </button>
            </HeaderField>
          ) : null}

          {showBcc ? (
            <HeaderField label="CCO">
              <Input
                placeholder="copia-oculta@email.com"
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                className="h-8 border-0 bg-transparent px-0 font-body text-[13px] shadow-none focus-visible:ring-0"
              />
              <button
                type="button"
                onClick={() => { setShowBcc(false); setBcc(""); }}
                className="shrink-0 text-[var(--text-muted)] hover:text-destructive"
              >
                <IconX size={13} />
              </button>
            </HeaderField>
          ) : null}

          <HeaderField label="Assunto">
            <Input
              placeholder="(sem assunto)"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-8 border-0 bg-transparent px-0 font-body text-[13px] shadow-none focus-visible:ring-0"
            />
          </HeaderField>
        </div>

        {/* Editor */}
        <div className="flex min-h-0 flex-1 flex-col">
          <EmailRichEditor
            ref={editorRef}
            key={editorKey}
            content={bodyHtml}
            onChange={(html, text) => { setBodyHtml(html); setBodyText(text); }}
            placeholder="Escreva sua mensagem…"
            minHeight="180px"
            className="h-full rounded-none border-0 border-b border-[var(--glass-border)]"
          />
        </div>

        {/* Rodapé */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-[var(--glass-border)] bg-[var(--glass-bg-base)] px-4 py-3">
          <button
            type="button"
            title="Anexar arquivo (em breve)"
            disabled
            className="inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] opacity-40"
          >
            <IconPaperclip size={16} />
          </button>

          {errors.send ? (
            <span className="flex-1 text-center font-body text-xs text-destructive">
              {errors.send}
            </span>
          ) : (
            <span className="flex-1" />
          )}

          <div className="flex items-center gap-2">
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              onClick={resetAndClose}
              disabled={loading}
            >
              Descartar
            </ButtonGlass>
            <ButtonGlass
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleSend()}
              disabled={loading}
            >
              {loading ? (
                <>
                  <IconLoader2 size={14} className="animate-spin" /> Enviando…
                </>
              ) : (
                <>
                  <IconSend size={14} /> Enviar
                </>
              )}
            </ButtonGlass>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeaderField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="w-14 shrink-0 text-right font-display text-[12px] font-semibold text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </div>
  );
}

function MetaToggle({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-1.5 py-0.5 font-display text-[11px] font-semibold text-[var(--text-muted)] hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-secondary)]"
    >
      {children}
    </button>
  );
}
