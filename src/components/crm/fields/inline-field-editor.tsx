"use client";

/**
 * InlineFieldEditor
 *
 * Editor inline para valores de campos personalizados.
 * Exibição: valor atual (clique para editar). Copiar fica na tooltip.
 * Edição: input adequado ao tipo do campo (text, number, date, select, boolean).
 * Salva via PUT /api/contacts/:id/custom-fields ou /api/deals/:id/custom-fields.
 */

import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconCheck,
  IconCopy,
  IconX,
  IconLoader2,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";
import { useCan } from "@/hooks/use-my-permissions";
import { DelayedHoverLegend } from "@/components/crm/delayed-hover-legend";
import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { TooltipGlass } from "@/components/crm/tooltip-glass";

export type FieldEntityType = "contact" | "deal";

export interface InlineFieldEditorProps {
  fieldId: string;
  fieldType: string;
  fieldOptions?: string[];
  value: string | null;
  entityType: FieldEntityType;
  entityId: string;
  /** Invalidation keys adicionais do react-query após salvar. */
  invalidateKeys?: unknown[][];
  /** Callback chamado com o novo valor após salvar com sucesso. */
  onSaved?: (newValue: string) => void;
  /** Tamanho do texto de exibição */
  textClassName?: string;
  /** Placeholder quando não há valor */
  placeholder?: string;
  /** Quando true, o ícone ✏ fica sempre visível (seção em modo edição ativo) */
  editMode?: boolean;
}

async function saveFieldValue(
  entityType: FieldEntityType,
  entityId: string,
  fieldId: string,
  value: string,
) {
  const path =
    entityType === "contact"
      ? `/api/contacts/${entityId}/custom-fields`
      : `/api/deals/${entityId}/custom-fields`;
  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [{ fieldId, value }] }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Erro ao salvar");
  }
  return res.json();
}

export function InlineFieldEditor({
  fieldId,
  fieldType,
  fieldOptions = [],
  value,
  entityType,
  entityId,
  invalidateKeys,
  onSaved,
  textClassName,
  placeholder = "Adicionar",
  editMode: _editMode = false,
}: InlineFieldEditorProps) {
  const qc = useQueryClient();
  const canEditEntity = useCan(
    entityType === "contact" ? "contact:edit" : "deal:edit",
  );
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  React.useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select?.();
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: () => saveFieldValue(entityType, entityId, fieldId, draft),
    onSuccess: () => {
      onSaved?.(draft);
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          qc.invalidateQueries({ queryKey: key });
        }
      }
      setEditing(false);
    },
    onError: (e: Error) => {
      toast.error(e.message);
    },
  });

  const startEdit = () => {
    if (!canEditEntity) return;
    setDraft(value ?? "");
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const save = () => {
    if (draft === (value ?? "")) {
      setEditing(false);
      return;
    }
    mutation.mutate();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
    if (e.key === "Escape") cancel();
  };

  /* ── Modo de exibição ── */
  if (!editing) {
    const isEmpty = !value?.trim();
    const displayValue = isEmpty
      ? placeholder
      : formatDisplayValue(value!, fieldType);

    const handleCopy = async () => {
      if (isEmpty) return;
      try {
        await navigator.clipboard.writeText(value!);
        toast.success("Copiado");
      } catch {
        toast.error("Falha ao copiar");
      }
    };

    const row = (
      <div
        className={cn(
          "group flex w-full min-w-0 max-w-full items-center gap-1 overflow-hidden transition-colors",
          isEmpty
            ? "font-display text-[11px] text-[var(--text-muted)] opacity-60 italic"
            : textClassName ??
                "font-display text-[13px] font-bold text-[var(--text-primary)]",
        )}
      >
        {canEditEntity ? (
          <button
            type="button"
            onClick={startEdit}
            aria-label={`Editar ${fieldId}`}
            data-legend-measure
            className="min-w-0 flex-1 truncate text-left leading-snug"
          >
            {displayValue}
          </button>
        ) : (
          <span
            data-legend-measure
            className="min-w-0 flex-1 truncate text-left leading-snug"
          >
            {displayValue}
          </span>
        )}
        {!isEmpty && (
          <TooltipGlass label="Copiar" side="top" delay={300}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void handleCopy();
              }}
              className="flex size-5 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] group-hover:opacity-100"
              aria-label="Copiar"
            >
              <IconCopy size={12} stroke={2.2} />
            </button>
          </TooltipGlass>
        )}
      </div>
    );

    if (isEmpty) return row;
    // Valor truncado: após 1,5s mostra o nome completo logo abaixo do cursor.
    return (
      <DelayedHoverLegend text={value ?? ""} className="block w-full min-w-0">
        {row}
      </DelayedHoverLegend>
    );
  }

  /* ── Modo de edição ── */
  const inputBase =
    "h-7 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] px-2 font-display text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";

  const actions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={save}
        disabled={mutation.isPending}
        aria-label="Salvar"
        className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--brand-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] disabled:opacity-50"
      >
        {mutation.isPending ? (
          <IconLoader2 size={12} className="animate-spin" />
        ) : (
          <IconCheck size={12} />
        )}
      </button>
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancelar"
        className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)]"
      >
        <IconX size={12} />
      </button>
    </div>
  );

  /* ── SELECT ── */
  if (fieldType === "SELECT" && fieldOptions.length > 0) {
    const saveSelect = (v: string) => {
      setDraft(v);
      void saveFieldValue(entityType, entityId, fieldId, v)
        .then(() => {
          onSaved?.(v);
          if (invalidateKeys) {
            for (const key of invalidateKeys) {
              qc.invalidateQueries({ queryKey: key });
            }
          }
          setEditing(false);
        })
        .catch((e: Error) => toast.error(e.message));
    };
    return (
      <div className="flex w-full items-center gap-1">
        <DropdownGlass
          options={[
            { value: "", label: "— Limpar —" },
            ...fieldOptions.map((o) => ({ value: o, label: o })),
          ]}
          value={draft}
          onValueChange={saveSelect}
          matchTriggerWidth
          triggerClassName="h-7 w-full rounded-[var(--radius-sm)] px-2 text-[12px]"
        />
        {actions}
      </div>
    );
  }

  /* ── BOOLEAN ── */
  if (fieldType === "BOOLEAN") {
    return (
      <div className="flex items-center gap-1.5">
        {["Sim", "Não"].map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => {
              setDraft(opt);
              void saveFieldValue(entityType, entityId, fieldId, opt)
                .then(() => {
                  onSaved?.(opt);
                  if (invalidateKeys) {
                    for (const key of invalidateKeys) {
                      qc.invalidateQueries({ queryKey: key });
                    }
                  }
                  setEditing(false);
                })
                .catch((e: Error) => toast.error(e.message));
            }}
            className={cn(
              "rounded-full px-3 py-0.5 font-display text-[11.5px] font-semibold transition-colors",
              draft === opt
                ? "bg-[var(--brand-primary)] text-white"
                : "bg-[var(--glass-bg-strong)] text-[var(--text-muted)] hover:text-[var(--text-primary)]",
            )}
          >
            {opt}
          </button>
        ))}
        <button
          type="button"
          onClick={cancel}
          className="flex h-5 w-5 items-center justify-center rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <IconX size={11} />
        </button>
      </div>
    );
  }

  /* ── TEXT / NUMBER / DATE / EMAIL / URL / PHONE ── */
  const inputType = fieldType === "NUMBER"
    ? "number"
    : fieldType === "DATE"
      ? "date"
      : "text";

  const inputValue =
    fieldType === "DATE" ? toDateInputValue(draft) : draft;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = fieldType === "DATE"
      ? fromDateInputValue(e.target.value)
      : e.target.value;
    setDraft(v);
  };

  return (
    <div className="flex w-full items-center gap-1">
      <input
        ref={inputRef}
        type={inputType}
        value={inputValue}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // Delay para que o clique no botão de salvar/cancelar seja processado antes
          setTimeout(() => {
            if (editing && !mutation.isPending) save();
          }, 150);
        }}
        className={cn(inputBase, "flex-1 min-w-0")}
      />
      {actions}
    </div>
  );
}

/* ─── helpers de formatação ─── */

function formatDisplayValue(value: string, type: string): string {
  if (type === "DATE") {
    // tenta formatar YYYY-MM-DD → DD/MM/YYYY
    const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return value;
}

function toDateInputValue(v: string): string {
  if (!v) return "";
  // DD/MM/YYYY → YYYY-MM-DD
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // já está em YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return v;
}

function fromDateInputValue(v: string): string {
  if (!v) return "";
  // YYYY-MM-DD → DD/MM/YYYY
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
}
