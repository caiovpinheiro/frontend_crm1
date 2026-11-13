"use client";

/**
 * Apelido do grupo só no CRM: o nome no WhatsApp não muda e a sincronização
 * não desfaz. Sem apelido, vale o nome do WhatsApp.
 */
import { useState } from "react";
import { IconCheck as Check, IconPencil as Pencil, IconX as X } from "@tabler/icons-react";
import { toast } from "sonner";

import { useWhatsAppGroupMutations } from "./hooks";
import type { WhatsAppGroupDetail, WhatsAppGroupListItem } from "./types";

export const GROUP_CUSTOM_NAME_MAX = 100;

/** Nome que a tela mostra: apelido do CRM ou, sem ele, o do WhatsApp. */
export function groupDisplayName(g: Pick<WhatsAppGroupListItem, "name" | "customName">): string {
  return g.customName?.trim() || g.name?.trim() || "Grupo sem nome";
}

/** A busca da lista encontra o grupo pelo apelido e pelo nome do WhatsApp. */
export function groupMatchesSearch(g: Pick<WhatsAppGroupListItem, "name" | "customName">, term: string): boolean {
  const t = term.trim().toLowerCase();
  if (!t) return true;
  return [g.customName, g.name].some((n) => n?.toLowerCase().includes(t));
}

const ICON_BTN =
  "grid h-8 w-8 shrink-0 place-items-center rounded-[var(--orbita-radius-inner)] text-[var(--orbita-text-tertiary)] transition-colors hover:bg-[var(--orbita-field)] hover:text-[var(--orbita-text)] disabled:opacity-50";

export function GroupName({ group }: { group: WhatsAppGroupDetail }) {
  const mut = useWhatsAppGroupMutations();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const custom = group.customName?.trim() || null;
  const busy = mut.setCustomName.isPending;

  const start = () => {
    setDraft(custom ?? group.name ?? "");
    setEditing(true);
  };

  const save = () => {
    const value = draft.replace(/\s+/g, " ").trim();
    // Igual ao nome do WhatsApp = sem apelido.
    const next = value && value !== group.name.trim() ? value : null;
    if (next === custom) {
      setEditing(false);
      return;
    }
    mut.setCustomName.mutate(
      { id: group.id, customName: next },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success(next ? "Nome do grupo alterado no CRM." : "Voltou a usar o nome do WhatsApp.");
        },
        onError: (err) =>
          toast.error(err instanceof Error && err.message ? err.message : "Não foi possível salvar o nome do grupo."),
      },
    );
  };

  if (editing) {
    return (
      <form
        className="mt-3 flex w-full items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input
          autoFocus
          aria-label="Nome do grupo no CRM"
          value={draft}
          maxLength={GROUP_CUSTOM_NAME_MAX}
          disabled={busy}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className="h-9 min-w-0 flex-1 rounded-[var(--orbita-radius-inner)] border border-[var(--orbita-border)] bg-[var(--orbita-surface)] px-3 text-[15px] text-[var(--orbita-text)] outline-none focus:border-[var(--orbita-selected)]"
        />
        <button type="submit" className={ICON_BTN} disabled={busy} aria-label="Salvar nome">
          <Check className="h-4 w-4" />
        </button>
        <button type="button" className={ICON_BTN} disabled={busy} onClick={() => setEditing(false)} aria-label="Cancelar">
          <X className="h-4 w-4" />
        </button>
      </form>
    );
  }

  return (
    <>
      <div className="mt-3 flex max-w-full items-center justify-center gap-1">
        <h4 className="min-w-0 break-words text-[19px] font-semibold text-[var(--orbita-text)]">
          {groupDisplayName(group)}
        </h4>
        <button type="button" className={ICON_BTN} onClick={start} aria-label="Renomear grupo no CRM" title="Renomear só no CRM">
          <Pencil className="h-4 w-4" />
        </button>
      </div>
      {custom && group.name?.trim() ? (
        <p className="mt-0.5 text-[12.5px] text-[var(--orbita-text-tertiary)]">No WhatsApp: {group.name}</p>
      ) : null}
    </>
  );
}
