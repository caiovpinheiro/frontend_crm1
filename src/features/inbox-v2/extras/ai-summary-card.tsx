"use client";

import { IconChevronRight as ChevronRight, IconCopy as Copy, IconNotes as Notes } from "@tabler/icons-react";
import * as React from "react";
import { toast } from "sonner";

import { parseSummaryContent } from "@/features/inbox-v2/extras/ai-summary-parse";
import { cn } from "@/lib/utils";

/**
 * Cartão do resumo do atendimento (`messageType=ai_summary`, privado).
 *
 * Fica no ponto da linha do tempo em que o agente encerrou ou transferiu.
 * Fechado mostra uma linha (motivo → resultado · pendência); aberto, os
 * itens. Só a equipe vê; o cliente não recebe nada.
 */
export function AISummaryCard({
  content,
  time,
  senderName,
  defaultOpen = false,
}: {
  content: string;
  /** Hora já formatada pela lista ("11:58"). */
  time?: string | null;
  senderName?: string | null;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const parsed = React.useMemo(() => parseSummaryContent(content), [content]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("Resumo copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="flex w-full justify-center px-2 py-1">
      <section
        className="w-full max-w-[92%] border border-[var(--color-border)] border-l-[3px] border-l-[var(--color-brand-primary)] bg-[var(--color-surface)] text-sm md:max-w-[85%]"
        aria-label="Resumo do atendimento"
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center gap-2 px-3 py-2 text-left"
        >
          <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <Notes className="size-4 shrink-0 text-[var(--color-brand-primary)]" />
          <span className="font-medium">Resumo do atendimento</span>
          <span className="rounded-full bg-[var(--color-brand-primary)]/10 px-2 py-0.5 text-[11px] text-[var(--color-brand-primary)]">
            só a equipe vê
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {[senderName, time].filter(Boolean).join(" · ")}
          </span>
        </button>

        {!open && (
          <p className="truncate px-3 pb-2 pl-[2.6rem] text-[13px] text-muted-foreground" title={parsed.oneLine}>
            {parsed.oneLine}
          </p>
        )}

        {open && (
          <div className="px-3 pb-3 pl-[2.6rem]">
            {parsed.items.length > 0 ? (
              <dl className="grid grid-cols-[minmax(110px,150px)_1fr] gap-x-3 gap-y-1.5 text-[13px]">
                {parsed.items.map((item) => (
                  <React.Fragment key={item.label}>
                    <dt className="text-muted-foreground">{item.label}</dt>
                    <dd className="whitespace-pre-wrap">{item.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            ) : (
              <p className="whitespace-pre-wrap text-[13px]">{content}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={copy}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-muted"
              >
                <Copy className="size-3.5" /> Copiar
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
