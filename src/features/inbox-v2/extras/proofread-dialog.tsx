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
import type { ProofreadMatch, ProofreadResult } from "@/features/inbox-v2/api/proofread";

function matchExcerpt(original: string, match: ProofreadMatch): string {
  if (
    match.offset < 0 ||
    match.length < 0 ||
    match.offset > original.length ||
    match.offset + match.length > original.length
  ) {
    return "";
  }
  if (match.length === 0) return "";
  return original.slice(match.offset, match.offset + match.length);
}

function matchTitle(match: ProofreadMatch): string {
  const short = match.shortMessage?.trim();
  if (short) return short;
  const msg = (match.message ?? "").trim();
  if (msg.length > 0 && msg.length <= 72) return msg;
  return "Pontuação / estilo";
}

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
  const original = result?.original ?? "";

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
            {matches.slice(0, 8).map((m, i) => {
              const excerpt = matchExcerpt(original, m);
              const fix = m.replacements[0];
              return (
                <li
                  key={`${m.offset}-${m.length}-${i}`}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <p className="font-medium">{matchTitle(m)}</p>
                  {excerpt || fix ? (
                    <p className="mt-0.5 text-sm">
                      {excerpt ? (
                        <span className="text-muted-foreground line-through">{excerpt}</span>
                      ) : (
                        <span className="text-muted-foreground">inserir</span>
                      )}
                      {fix ? (
                        <>
                          <span className="text-muted-foreground"> → </span>
                          <span className="font-medium text-foreground">{fix}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground"> · sem sugestão</span>
                      )}
                    </p>
                  ) : null}
                </li>
              );
            })}
            {matches.length > 8 ? (
              <li className="text-xs text-muted-foreground">
                +{matches.length - 8} outros
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {original && original !== (result?.suggested ?? "") ? (
        <div>
          <span className={formLabelClass}>Texto original</span>
          <p className="rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
            {original}
          </p>
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
