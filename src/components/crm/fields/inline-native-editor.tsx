"use client";

/**
 * InlineNativeEditor
 *
 * Editor inline para campos nativos de Contact e Deal
 * (PUT /api/contacts/:id ou PUT /api/deals/:id).
 *
 * UX: valor com lápis ao hover → clique abre input → Enter/✓ salva.
 */

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateQueryKey } from "@/features/inbox-v2/hooks/inbox-list-refresh";
import { toast } from "sonner";
import { IconPencil, IconCheck, IconX, IconLoader2 } from "@tabler/icons-react";
import { CopyValueButton } from "@/components/crm/copy-value-button";
import { cn } from "@/lib/utils";
import { apiUrl } from "@/lib/api";
import { useCan } from "@/hooks/use-my-permissions";

export interface InlineNativeEditorProps {
  value: string | undefined | null;
  entityType: "contact" | "deal";
  entityId: string;
  /** Chave enviada no body do PUT, ex.: "name", "phone", "value" */
  fieldKey: string;
  inputType?: "text" | "email" | "tel" | "number" | "date";
  /** Chaves do react-query para invalidar após salvar */
  invalidateKeys?: unknown[][];
  onSaved?: (newValue: string) => void;
  textClassName?: string;
  /** Classe do estado vazio (placeholder). Default: muted+italic. Útil para
   *  sobrepor a cor em fundos escuros (ex.: hero do aside). */
  emptyClassName?: string;
  placeholder?: string;
  /** Formata o valor para exibição (ex.: moeda, data) */
  formatDisplay?: (raw: string) => string;
  /** Quando true, o ícone ✏ fica sempre visível (seção em modo edição ativo) */
  editMode?: boolean;
  /**
   * Override da persistência. Quando fornecido, é chamado no lugar do
   * PUT nativo (ex.: negócio sem contato vinculado → criar contato + linkar
   * ao deal). Recebe o valor já com trim aplicado.
   */
  customSave?: (trimmedValue: string) => Promise<void>;
  /** Quando informado, exibe lista de sugestões ao editar (ex.: origem do contato). */
  suggestions?: string[];
}

async function putNativeField(
  entityType: "contact" | "deal",
  entityId: string,
  fieldKey: string,
  rawValue: string,
) {
  const path =
    entityType === "contact"
      ? `/api/contacts/${entityId}`
      : `/api/deals/${entityId}`;

  const body: Record<string, unknown> = {};
  if (fieldKey === "value" || fieldKey === "leadScore") {
    body[fieldKey] = rawValue === "" ? null : Number(rawValue);
  } else {
    body[fieldKey] = rawValue === "" ? null : rawValue;
  }

  const res = await fetch(apiUrl(path), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message ?? "Erro ao salvar");
  }
  return res.json();
}

export function InlineNativeEditor({
  value,
  entityType,
  entityId,
  fieldKey,
  inputType = "text",
  invalidateKeys,
  onSaved,
  textClassName,
  emptyClassName,
  placeholder = "Adicionar",
  formatDisplay,
  editMode = false,
  customSave,
  suggestions,
}: InlineNativeEditorProps) {
  const qc = useQueryClient();
  // Sem a permission do recurso, o valor é só leitura — o backend também
  // rejeita o PUT, mas esconder o lápis evita o falso "deu pra editar".
  const canEditEntity = useCan(
    entityType === "contact" ? "contact:edit" : "deal:edit",
  );
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value ?? "");
  const [saving, setSaving] = React.useState(false);
  const [pickingSuggestion, setPickingSuggestion] = React.useState(false);
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

  const startEdit = () => {
    if (!canEditEntity) return;
    setDraft(value ?? "");
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value ?? "");
    setEditing(false);
  };

  const save = async () => {
    const trimmed = draft.trim();
    if (trimmed === (value ?? "").trim()) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      if (customSave) {
        await customSave(trimmed);
      } else {
        await putNativeField(entityType, entityId, fieldKey, trimmed);
      }
      onSaved?.(trimmed);
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          invalidateQueryKey(qc, key);
        }
      }
      if (fieldKey === "source") {
        // Mesma key do `useContactSources` (P1-2 — cache compartilhado
        // com as filter-options do Kanban).
        qc.invalidateQueries({ queryKey: ["kanban-filter-options"] });
      }
      setEditing(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void save();
    }
    if (e.key === "Escape") cancel();
  };

  const filteredSuggestions = React.useMemo(() => {
    if (!suggestions?.length) return [];
    const q = draft.trim().toLowerCase();
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (s: string) => {
      const key = s.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      out.push(s);
    };
    for (const s of suggestions) {
      if (!q || s.toLowerCase().includes(q)) push(s);
    }
    const cur = value?.trim();
    if (cur) push(cur);
    return out.slice(0, 15);
  }, [suggestions, draft, value]);

  /* ── Modo exibição ── */
  if (!editing) {
    const isEmpty = !value?.trim();
    const display = isEmpty
      ? placeholder
      : formatDisplay
        ? formatDisplay(value!)
        : value!;
    const textCls = cn(
      "min-w-0 truncate",
      isEmpty
        ? (emptyClassName ?? "font-display text-[11px] italic text-[var(--text-muted)] opacity-60")
        : (textClassName ?? "font-display text-[13px] font-bold text-[var(--text-primary)]"),
    );

    if (!canEditEntity) {
      return (
        <span className={cn("group flex min-w-0 items-center justify-end gap-1 text-right", textCls)} title={isEmpty ? undefined : String(display)}>
          <span className="min-w-0 truncate">{display}</span>
          {!isEmpty && <CopyValueButton text={String(display)} />}
        </span>
      );
    }

    return (
      <div
        className={cn(
          "group flex min-w-0 items-center justify-end gap-1 text-right",
          isEmpty
            ? (emptyClassName ?? "font-display text-[11px] italic text-[var(--text-muted)] opacity-60")
            : (textClassName ?? "font-display text-[13px] font-bold text-[var(--text-primary)]"),
        )}
      >
        <button
          type="button"
          onClick={startEdit}
          className="min-w-0 truncate text-right"
          aria-label={`Editar ${fieldKey}`}
          title={isEmpty ? undefined : String(display)}
        >
          {display}
        </button>
        {!isEmpty && <CopyValueButton text={String(display)} />}
        <IconPencil
          size={12}
          className={cn(
            "mt-px shrink-0 transition-opacity group-hover:opacity-60",
            editMode ? "opacity-40" : "opacity-0",
          )}
        />
      </div>
    );
  }

  /* ── Modo edição ── */
  const inputBase =
    "h-7 min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] px-2 font-display text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]";

  return (
    <div className="relative flex w-full flex-col items-end">
      <div className="flex w-full items-center justify-end gap-1">
        <input
          ref={inputRef}
          type={inputType}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setTimeout(() => {
              if (pickingSuggestion) {
                setPickingSuggestion(false);
                return;
              }
              if (editing && !saving) void save();
            }, 150);
          }}
          className={inputBase}
          placeholder={placeholder}
        />
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            aria-label="Salvar"
            className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-sm)] text-[var(--brand-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--brand-primary)_12%,transparent)] disabled:opacity-50"
          >
            {saving ? (
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
      </div>
      {filteredSuggestions.length > 0 ? (
        <ul
          className="absolute right-0 top-full z-50 mt-1 max-h-44 w-full min-w-[180px] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] py-1 shadow-[var(--glass-shadow-md)]"
          role="listbox"
        >
          {filteredSuggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                role="option"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setPickingSuggestion(true);
                  setDraft(s);
                  inputRef.current?.focus();
                }}
                className={cn(
                  "flex w-full px-2.5 py-1.5 text-left font-display text-[12px] transition-colors hover:bg-[var(--glass-bg-overlay)]",
                  draft.trim().toLowerCase() === s.toLowerCase()
                    ? "bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)] font-semibold text-[var(--brand-primary)]"
                    : "text-[var(--text-primary)]",
                )}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
