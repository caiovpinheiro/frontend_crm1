import type { EmailDetail } from "../api/types";
import { decodeIfQuotedPrintable, decodeHtmlEntities } from "../components/html-email-frame";

export type ComposeMode = "new" | "reply" | "forward";

export interface ComposeDraft {
  mode: ComposeMode;
  accountId?: string;
  to?: string;
  cc?: string;
  bcc?: string;
  subject?: string;
  bodyHtml?: string;
  inReplyTo?: string;
}

function cleanText(input: string | null): string {
  return decodeHtmlEntities(decodeIfQuotedPrintable(input?.trim() ?? ""));
}

function replySubject(subject: string | null): string {
  const base = cleanText(subject) || "(sem assunto)";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

function forwardSubject(subject: string | null): string {
  const base = cleanText(subject) || "(sem assunto)";
  return /^enc:/i.test(base) ? base : `Enc: ${base}`;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function quoteBlock(email: EmailDetail): string {
  const date = email.receivedAt
    ? new Date(email.receivedAt).toLocaleString("pt-BR")
    : "";
  const from = email.fromName
    ? `${email.fromName} &lt;${email.fromAddress}&gt;`
    : email.fromAddress;

  // Prefere bodyText, mas cai para bodyHtml decodificado quando o bodyText
  // veio parcialmente decodificado ou truncado pelo parser legado.
  const textBody = cleanText(email.bodyText);
  const htmlBody = email.bodyHtml
    ? cleanText(stripTags(email.bodyHtml))
    : "";
  const body = textBody || htmlBody || "(sem conteúdo)";

  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br/>");

  return `<p><br/></p><p><br/></p><blockquote style="margin:0;padding-left:12px;border-left:3px solid var(--glass-border);color:var(--text-muted);word-break:break-word;overflow-wrap:anywhere"><p style="margin:0 0 8px;font-size:12px">Em ${date}, ${from} escreveu:</p><p style="margin:0;font-size:13px;word-break:break-word;overflow-wrap:anywhere">${escaped}</p></blockquote>`;
}

/** Destinatário ao responder: remetente original (INBOX) ou destinatário (SENT). */
export function replyToAddress(email: EmailDetail): string {
  if (email.folder === "SENT") return email.toAddress;
  return email.fromAddress;
}

export function buildComposeDraft(
  email: EmailDetail,
  mode: "reply" | "forward",
): ComposeDraft {
  const accountId = email.account.id;

  if (mode === "reply") {
    return {
      mode: "reply",
      accountId,
      to: replyToAddress(email),
      subject: replySubject(email.subject),
      bodyHtml: quoteBlock(email),
      inReplyTo: email.messageId ?? undefined,
    };
  }

  return {
    mode: "forward",
    accountId,
    subject: forwardSubject(email.subject),
    bodyHtml: `<p><br/></p>${quoteBlock(email)}`,
  };
}

export function newComposeDraft(defaultAccountId?: string): ComposeDraft {
  return { mode: "new", accountId: defaultAccountId };
}
