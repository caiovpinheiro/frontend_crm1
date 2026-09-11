"use client";

import { useEffect, useState } from "react";
import { IconPlus, IconTrash, IconAdjustments } from "@tabler/icons-react";

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
import type { ProofreadReplacement } from "@/features/inbox-v2/lib/proofread-pilot";

export function ProofreadPilotDialog({
  open,
  onOpenChange,
  replacements,
  ignore,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  replacements: ProofreadReplacement[];
  ignore: string[];
  onSave: (next: {
    replacements: ProofreadReplacement[];
    ignore: string[];
  }) => void;
}) {
  const [pairs, setPairs] = useState<ProofreadReplacement[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ignoreDraft, setIgnoreDraft] = useState("");

  useEffect(() => {
    if (!open) return;
    setPairs(replacements);
    setIgnored(ignore);
    setFrom("");
    setTo("");
    setIgnoreDraft("");
  }, [open, replacements, ignore]);

  function addPair() {
    const nextFrom = from.trim();
    const nextTo = to.trim();
    if (!nextFrom || !nextTo) return;
    setPairs((prev) => [
      ...prev.filter((item) => item.from.toLowerCase() !== nextFrom.toLowerCase()),
      { from: nextFrom, to: nextTo },
    ]);
    setFrom("");
    setTo("");
  }

  function addIgnore() {
    const token = ignoreDraft.trim().toLowerCase();
    if (!token) return;
    setIgnored((prev) => (prev.includes(token) ? prev : [...prev, token]));
    setIgnoreDraft("");
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Regras do corretor"
      description="Ficam neste navegador. O LanguageTool não precisa passar pelo suporte."
      icon={
        <FormDialogIcon>
          <IconAdjustments className="size-4" />
        </FormDialogIcon>
      }
      footer={
        <>
          <ButtonGlass
            type="button"
            variant="glass"
            className={formDialogCancelClass}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </ButtonGlass>
          <ButtonGlass
            type="button"
            variant="primary"
            className={formDialogPrimaryClass}
            onClick={() => {
              onSave({ replacements: pairs, ignore: ignored });
              onOpenChange(false);
            }}
          >
            Salvar regras
          </ButtonGlass>
        </>
      }
    >
      <div>
        <span className={formLabelClass}>Quando eu escrever → sugerir</span>
        <p className="mb-2 text-xs text-muted-foreground">
          Ex.: mi escrevi → me inscrevi
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            placeholder="mi escrevi"
            className={cn(formControlClass, "h-10")}
          />
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="me inscrevi"
            className={cn(formControlClass, "h-10")}
          />
          <ButtonGlass
            type="button"
            variant="glass"
            className={cn(formDialogCancelClass, "shrink-0")}
            onClick={addPair}
          >
            <IconPlus className="size-4" />
            Adicionar
          </ButtonGlass>
        </div>
        {pairs.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1.5">
            {pairs.map((item) => (
              <li
                key={item.from}
                className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm"
              >
                <span>
                  <span className="text-muted-foreground">{item.from}</span>
                  {" → "}
                  <span className="font-medium">{item.to}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remover ${item.from}`}
                  className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  onClick={() =>
                    setPairs((prev) => prev.filter((row) => row.from !== item.from))
                  }
                >
                  <IconTrash className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <span className={formLabelClass}>Nunca apontar</span>
        <p className="mb-2 text-xs text-muted-foreground">
          Trechos que o LanguageTool erra e você quer ignorar (ex.: fcee).
        </p>
        <div className="flex gap-2">
          <input
            value={ignoreDraft}
            onChange={(e) => setIgnoreDraft(e.target.value)}
            placeholder="fcee"
            className={cn(formControlClass, "h-10")}
          />
          <ButtonGlass
            type="button"
            variant="glass"
            className={cn(formDialogCancelClass, "shrink-0")}
            onClick={addIgnore}
          >
            <IconPlus className="size-4" />
            Ignorar
          </ButtonGlass>
        </div>
        {ignored.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {ignored.map((token) => (
              <li
                key={token}
                className="flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1 text-sm"
              >
                {token}
                <button
                  type="button"
                  aria-label={`Parar de ignorar ${token}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setIgnored((prev) => prev.filter((item) => item !== token))
                  }
                >
                  <IconTrash className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FormDialog>
  );
}
