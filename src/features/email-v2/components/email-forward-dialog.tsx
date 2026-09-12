"use client";

import * as React from "react";
import { IconLoader2, IconSend } from "@tabler/icons-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { FormDialog } from "@/components/ui/form-dialog";
import { Input } from "@/components/ui/input";

import { sendEmail } from "../api/emails";
import type { EmailDetail } from "../api/types";
import { parseEmailAddresses } from "../lib/parse-addresses";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: EmailDetail | null;
  accountId?: string;
  onSent: (id: string) => void;
  onCompose: () => void;
}

export function EmailForwardDialog({
  open,
  onOpenChange,
  email,
  accountId,
  onSent,
  onCompose,
}: Props) {
  const [to, setTo] = React.useState("");
  const [sending, setSending] = React.useState(false);

  React.useEffect(() => {
    if (open) setTo("");
  }, [open]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !accountId) {
      toast.error("Selecione uma conta para encaminhar.");
      return;
    }
    const recipients = parseEmailAddresses(to);
    if (recipients.length === 0) {
      toast.error("Informe um destinatário válido.");
      return;
    }
    setSending(true);
    try {
      const subject = email.subject?.startsWith("Enc:")
        ? email.subject
        : `Enc: ${email.subject || "(sem assunto)"}`;
      const sent = await sendEmail({
        accountId,
        to: recipients.join(", "),
        subject,
        bodyText: `Encaminhado de ${email.fromAddress}.\n\n${email.bodyText ?? ""}`,
        bodyHtml: email.bodyHtml
          ? `<p>Encaminhado de ${email.fromAddress}.</p>${email.bodyHtml}`
          : undefined,
      });
      toast.success("E-mail encaminhado.");
      onOpenChange(false);
      onSent(sent.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao encaminhar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={sending}
      size="md"
      title="Encaminhar e-mail"
      description="Envie agora para um endereço ou abra o editor para ajustar o texto."
      footer={
        <>
          <ButtonGlass type="button" variant="glass" size="sm" onClick={onCompose} disabled={sending}>
            Abrir editor
          </ButtonGlass>
          <ButtonGlass type="submit" form="email-forward-form" variant="primary" size="sm" disabled={sending}>
            {sending ? (
              <>
                <IconLoader2 size={14} className="animate-spin" /> Enviando…
              </>
            ) : (
              <>
                <IconSend size={14} /> Enviar
              </>
            )}
          </ButtonGlass>
        </>
      }
    >
      <form id="email-forward-form" onSubmit={handleSend} className="flex flex-col gap-3">
        <p className="truncate text-sm font-semibold">{email?.subject ?? "(sem assunto)"}</p>
        <label className="block space-y-1.5">
          <span className="text-[12px] font-semibold text-muted-foreground">Para</span>
          <Input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="destino@empresa.com"
            className="h-9"
            required
          />
        </label>
      </form>
    </FormDialog>
  );
}
