"use client";

import * as React from "react";
import { IconArrowLeft, IconLoader2, IconSend, IconX } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { Input } from "@/components/ui/input";

import { sendEmail } from "../api/emails";
import type { EmailAccount } from "../api/types";
import { isBlankEmailBody, parseEmailAddresses } from "../lib/parse-addresses";
import type { ComposeDraft, ComposeMode } from "../utils/compose-draft";
import { EmailRichEditor, type EmailRichEditorHandle } from "./email-rich-editor";

const MODE_TITLES: Record<ComposeMode, string> = {
  new: "Novo e-mail",
  reply: "Responder",
  forward: "Encaminhar",
};

interface Props {
  accounts: EmailAccount[];
  draft: ComposeDraft;
  onCancel: () => void;
  onSent: (id: string) => void;
  onBack?: () => void;
}

export function ComposeView({ accounts, draft, onCancel, onSent, onBack }: Props) {
  const [accountId, setAccountId] = React.useState("");
  const [to, setTo] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [bodyHtml, setBodyHtml] = React.useState("");
  const [bodyText, setBodyText] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [editorKey, setEditorKey] = React.useState(0);
  const editorRef = React.useRef<EmailRichEditorHandle>(null);
  const draftKey = `${draft.mode}|${draft.accountId ?? ""}|${draft.to ?? ""}|${draft.subject ?? ""}|${draft.inReplyTo ?? ""}|${draft.bodyHtml ?? ""}`;

  React.useEffect(() => {
    setAccountId(draft.accountId ?? "");
    setTo(draft.to ?? "");
    setSubject(draft.subject ?? "");
    setBodyHtml(draft.bodyHtml ?? "");
    setBodyText("");
    setErrors({});
    setEditorKey((k) => k + 1);
  }, [draftKey, draft.accountId, draft.to, draft.subject, draft.bodyHtml]);

  React.useEffect(() => {
    if (accountId) return;
    const fallback = draft.accountId ?? accounts[0]?.id;
    if (fallback) setAccountId(fallback);
  }, [accountId, accounts, draft.accountId]);

  const fromAccount = accounts.find((a) => a.id === accountId);
  const title = MODE_TITLES[draft.mode];

  async function handleSend() {
    const live = editorRef.current?.getContent();
    const html = live?.html || bodyHtml;
    const text = live?.text || bodyText;
    const recipients = parseEmailAddresses(to);
    const errs: Record<string, string> = {};
    if (!accountId) errs.accountId = "Selecione uma conta.";
    if (recipients.length === 0) errs.to = "Informe um destinatário válido.";
    if (draft.mode === "new" && isBlankEmailBody(html, text)) {
      errs.send = "Escreva o corpo da mensagem antes de enviar.";
    }
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setLoading(true);
    try {
      const sent = await sendEmail({
        accountId,
        to: recipients.join(", "),
        subject: subject.trim() || "(sem assunto)",
        bodyText: text,
        bodyHtml: html,
        inReplyTo: draft.inReplyTo,
      });
      onSent(sent.id);
    } catch (err) {
      setErrors({ send: err instanceof Error ? err.message : "Erro ao enviar." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--glass-border-subtle,var(--glass-border))] px-4 py-3">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] md:hidden"
          >
            <IconArrowLeft size={16} stroke={2} />
            Voltar
          </button>
        ) : null}
        <h2 className="flex-1 font-display text-[15px] font-extrabold leading-tight">
          {title}
        </h2>
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          aria-label="Fechar composição"
          className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className="shrink-0 divide-y divide-[var(--glass-border)] border-b border-[var(--glass-border)]">
        <Field label="De">
          {accounts.length > 1 ? (
            <DropdownGlass
              options={accounts.map((a) => ({ value: a.id, label: a.email }))}
              value={accountId}
              onValueChange={setAccountId}
              matchTriggerWidth
              triggerClassName="h-8 border-0 bg-transparent shadow-none"
            />
          ) : (
            <span className="font-body text-[13px] text-[var(--text-secondary)]">
              {fromAccount?.email ?? "—"}
            </span>
          )}
        </Field>
        <Field label="Para">
          <Input
            placeholder="destinatario@email.com, outro@email.com"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              if (errors.to) setErrors((p) => {
                const next = { ...p };
                delete next.to;
                return next;
              });
            }}
            className="h-8 border-0 bg-transparent px-0 font-body text-[13px] shadow-none focus-visible:ring-0"
          />
        </Field>
        {errors.to ? (
          <p className="px-4 py-1 font-body text-xs text-destructive">{errors.to}</p>
        ) : null}
        <Field label="Assunto">
          <Input
            placeholder="(sem assunto)"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="h-8 border-0 bg-transparent px-0 font-body text-[13px] shadow-none focus-visible:ring-0"
          />
        </Field>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <EmailRichEditor
          ref={editorRef}
          key={editorKey}
          content={bodyHtml}
          onChange={(html, text) => {
            setBodyHtml(html);
            setBodyText(text);
          }}
          placeholder="Escreva sua mensagem…"
          minHeight="160px"
          className="h-full rounded-none border-0"
        />
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--glass-border)] px-4 py-3">
        {errors.send ? (
          <span className="mr-auto font-body text-xs text-destructive">{errors.send}</span>
        ) : null}
        <ButtonGlass type="button" variant="glass" size="sm" onClick={onCancel} disabled={loading}>
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
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="w-14 shrink-0 text-right font-display text-[12px] font-semibold text-[var(--text-muted)]">
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
