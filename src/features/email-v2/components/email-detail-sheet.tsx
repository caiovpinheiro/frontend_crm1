"use client";

import * as React from "react";
import { IconLoader2, IconExternalLink, IconUser } from "@tabler/icons-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { EmailDetail } from "../api/types";
import { formatFullDate } from "../utils";
import { HtmlEmailFrame, decodeIfQuotedPrintable } from "./html-email-frame";

interface Props {
  email: EmailDetail | null;
  loading: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EmailDetailSheet({ email, loading, open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        {loading && (
          <div className="flex items-center justify-center flex-1 text-[var(--text-muted)]">
            <IconLoader2 size={20} className="animate-spin mr-2" /> Carregando…
          </div>
        )}

        {!loading && !email && (
          <div className="flex items-center justify-center flex-1 text-[var(--text-muted)]">
            <p className="text-sm">Selecione uma mensagem.</p>
          </div>
        )}

        {!loading && email && (
          <>
            <SheetHeader className="border-b border-border pb-5 bg-card rounded-t-2xl">
              <SheetTitle className="text-lg font-bold text-foreground leading-snug">
                {email.subject ?? "(sem assunto)"}
              </SheetTitle>

              <div className="space-y-2 mt-3">
                <MetaRow label="De">
                  <span className="text-[14px] text-foreground">
                    {email.fromName
                      ? `${email.fromName} <${email.fromAddress}>`
                      : email.fromAddress}
                  </span>
                </MetaRow>
                <MetaRow label="Para">
                  <span className="text-[14px] text-foreground">{email.toAddress}</span>
                </MetaRow>
                <MetaRow label="Data">
                  <span className="text-[14px] text-foreground">
                    {formatFullDate(email.receivedAt)}
                  </span>
                </MetaRow>
                {email.contact && (
                  <MetaRow label="Contato">
                    <a
                      href={`/contacts/${email.contact.id}`}
                      className="inline-flex items-center gap-1.5 text-[14px] text-brand hover:underline transition-colors"
                    >
                      <IconUser size={14} />
                      {email.contact.name}
                      <IconExternalLink size={12} className="opacity-70" />
                    </a>
                  </MetaRow>
                )}
                <MetaRow label="Conta">
                  <Badge variant="secondary" className="text-xs rounded-full px-3 py-1">
                    {email.account.email}
                    {email.account.visibility === "PERSONAL" && (
                      <span className="ml-1.5 opacity-70">· pessoal</span>
                    )}
                  </Badge>
                </MetaRow>
              </div>
            </SheetHeader>

            <ScrollArea className="flex-1 mt-5 p-4 bg-background">
              {email.bodyHtml ? (
                <HtmlEmailFrame html={email.bodyHtml} />
              ) : (
                <pre className="text-[14px] text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                  {email.bodyText ? decodeIfQuotedPrintable(email.bodyText) : "(sem conteúdo)"}
                </pre>
              )}
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs text-[var(--text-muted)] w-12 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

