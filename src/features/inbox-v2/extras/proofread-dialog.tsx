"use client";

import { useEffect, useState } from "react";
import { IconTextSpellcheck } from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import {
  FormDialog,
  FormDialogIcon,
  formControlClass,
  formDialogCancelClass,
  formDialogPrimaryClass,
  formLabelClass,
} from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";
import type { ProofreadResult } from "@/features/inbox-v2/api/proofread";

export function ProofreadDialog({
  open,
  onOpenChange,
  result,
  sending,
  onSendCorrection,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ProofreadResult | null;
  sending?: boolean;
  onSendCorrection: (text: string) => void | Promise<void>;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open && result) setDraft(result.suggested);
  }, [open, result]);

  const matches = result?.matches ?? [];

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Correção sugerida"
      description="O corretor encontrou erros. Revise o texto antes de enviar."
      icon={
        <FormDialogIcon>
          <IconTextSpellcheck className="size-4" />
        </FormDialogIcon>
      }
      busy={sending}
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            disabled={sending}
            onClick={() => onOpenChange(false)}
          >
            Voltar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            disabled={!draft.trim() || sending}
            onClick={() => void onSendCorrection(draft)}
          >
            Enviar correção
          </ButtonGlass>
        </>
      }
    >
      {matches.length > 0 ? (
        <div>
          <span className={formLabelClass}>Erros encontrados</span>
          <ul className="flex flex-col gap-1.5">
            {matches.slice(0, 8).map((m, i) => (
              <li
                key={`${m.offset}-${m.length}-${i}`}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                <p>{m.shortMessage || m.message}</p>
                {m.shortMessage && m.message !== m.shortMessage ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{m.message}</p>
                ) : null}
              </li>
            ))}
            {matches.length > 8 ? (
              <li className="text-xs text-muted-foreground">
                +{matches.length - 8} outros
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      <div>
        <span className={formLabelClass}>Texto proposto</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={5}
          disabled={sending}
          className={cn(
            formControlClass,
            "h-auto min-h-[120px] resize-y py-2.5 font-body text-sm leading-snug text-foreground",
          )}
        />
      </div>
    </FormDialog>
  );
}
