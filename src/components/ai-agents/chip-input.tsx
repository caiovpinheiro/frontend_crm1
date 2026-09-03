"use client";

import { IconPlus as Plus } from "@tabler/icons-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ChipInput({
  values,
  onChange,
  placeholder,
  suggestions,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = React.useState("");
  const listId = React.useId().replace(/:/g, "");

  const add = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };

  const unusedSuggestions = (suggestions ?? []).filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          list={suggestions?.length ? listId : undefined}
          onChange={(e) => setDraft(e.target.value)}
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
      {suggestions && suggestions.length > 0 && (
        <datalist id={listId}>
          {unusedSuggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-[12px]"
            >
              {k}
              <button
                type="button"
                onClick={() => onChange(values.filter((x) => x !== k))}
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Remover "${k}"`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
