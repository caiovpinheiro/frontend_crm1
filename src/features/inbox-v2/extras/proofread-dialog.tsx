"use client";

import { useEffect, useState } from "react";
import { IconAdjustments, IconTextSpellcheck, IconX } from "@tabler/icons-react";

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

function matchExcerpt(source: string, match: ProofreadMatch): string {
  if (
    match.offset < 0 ||
    match.length < 0 ||
    match.offset > source.length ||
    match.offset + match.length > source.length
  ) {
    return "";
  }
  if (match.length === 0) return "";
  return source.slice(match.offset, match.offset + match.length);
}

export function ProofreadDialog({
  open,
  onOpenChange,
  result,
  sending,
  onSendCorrection,
  onIgnoreExcerpt,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: ProofreadResult | null;
  sending?: boolean;
  onSendCorrection: (text: string) => void | Promise<void>;
  onIgnoreExcerpt?: (excerpt: string) => void;
  onOpenSettings?: () => void;
}) {
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open && result) setDraft(result.suggested);
  }, [open, result]);

  const matches = result?.matches ?? [];
  const original = result?.original ?? "";
  const matchSource = result?.matchSource ?? original;
  const extra = Math.max(0, matches.length - 4);
  const visible = matches.slice(0, 4);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Correção sugerida"
      description={
        matches.length > 1
          ? `${matches.length} correções. Edite o texto e envie.`
          : "O corretor encontrou um erro. Revise o texto antes de enviar."
      }
      icon={
        <FormDialogIcon>
          <IconTextSpellcheck className="size-4" />
        </FormDialogIcon>
      }
      busy={sending}
      footer={
        <>
          {onOpenSettings ? (
            <ButtonGlass
              type="button"
              variant="glass"
              className={cn(formDialogCancelClass, "mr-auto")}
              disabled={sending}
              onClick={onOpenSettings}
            >
              <IconAdjustments className="size-4" />
              Regras
            </ButtonGlass>
          ) : null}
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
      {visible.length > 0 ? (
        <div>
          <span className={formLabelClass}>Alterações</span>
          <ul className="flex flex-wrap gap-1.5">
            {visible.map((m, i) => {
              const excerpt = matchExcerpt(matchSource, m);
              const fix = m.replacements[0];
              return (
                <li
                  key={`${m.offset}-${m.length}-${i}`}
                  className="flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1 text-sm text-foreground"
                >
                  {excerpt ? (
                    <span className="text-muted-foreground line-through">
                      {excerpt}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">inserir</span>
                  )}
                  {fix ? (
                    <>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{fix}</span>
                    </>
                  ) : null}
                  {excerpt && onIgnoreExcerpt ? (
                    <button
                      type="button"
                      aria-label={`Ignorar ${excerpt}`}
                      className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      onClick={() => onIgnoreExcerpt(excerpt)}
                    >
                      <IconX className="size-3.5" />
                    </button>
                  ) : null}
                </li>
              );
            })}
            {extra > 0 ? (
              <li className="rounded-xl border border-border bg-card px-2.5 py-1 text-sm text-muted-foreground">
                +{extra}
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {original && original !== (result?.suggested ?? "") ? (
        <div>
          <span className={formLabelClass}>Texto original</span>
          <p className="line-clamp-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
            {original}
          </p>
        </div>
      ) : null}

      <div>
        <span className={formLabelClass}>Texto proposto</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          disabled={sending}
          className={cn(
            formControlClass,
            "h-auto min-h-[96px] resize-y py-2.5 font-body text-sm leading-snug text-foreground",
          )}
        />
      </div>
    </FormDialog>
  );
}
