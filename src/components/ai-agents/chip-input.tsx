"use client";

import { IconPlus as Plus } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Aceita `"Acolhimento"` e `{ name: "Acolhimento" }` — cache de outra aba
 * pode entregar o objeto, e isso não pode virar "[object Object]" nem
 * quebrar o render no meio do filtro. */
function asName(raw: unknown): string {
  if (typeof raw === "string") return raw.trim();
  if (raw && typeof raw === "object") {
    const name = (raw as { name?: unknown }).name;
    if (typeof name === "string") return name.trim();
  }
  return "";
}

export function ChipInput({
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: Array<string | { name?: string | null }>;
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId().replace(/:/g, "");

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.some((x) => asName(x).toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  const unusedSuggestions = React.useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of suggestions ?? []) {
      const name = asName(raw);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      if (values.some((v) => asName(v).toLowerCase() === key)) continue;
      out.push(name);
    }
    return out;
  }, [suggestions, values]);

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          list={unusedSuggestions.length ? listId : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim()) add(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              add(draft);
            }
          }}
          placeholder={placeholder}
        />
        <Button type="button" variant="outline" onClick={() => add(draft)}>
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
      {unusedSuggestions.length > 0 && (
        <datalist id={listId}>
          {unusedSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((k, i) => {
            const label = asName(k);
            if (!label) return null;
            return (
              <span
                key={`${label}-${i}`}
                className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-[12px]"
              >
                {label}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((_, j) => j !== i))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remover "${label}"`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
