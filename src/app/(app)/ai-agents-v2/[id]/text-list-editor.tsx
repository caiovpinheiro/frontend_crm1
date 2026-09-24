"use client";

/**
 * Lista de textos longos (regras, exemplos): uma linha por item, texto
 * inteiro visível e editável no lugar, ordem ajustável. Etiquetas (chips)
 * ficam para valores curtos (telefone, domínio, gatilho).
 */

import * as React from "react";
import { IconArrowDown, IconArrowUp, IconPlus, IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function AutoTextarea({
  value,
  onChange,
  onBlur,
  placeholder,
  autoFocus,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  // Cresce com o texto: a regra inteira fica visível, sem rolagem interna.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      autoFocus={autoFocus}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      className="min-h-10 w-full resize-none overflow-hidden rounded-lg border bg-background px-3 py-2 text-sm leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    />
  );
}

export function TextListEditor({
  values,
  onChange,
  addLabel,
  placeholder,
  numbered = true,
  itemLabel = "Item",
  emptyText,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  addLabel: string;
  placeholder?: string;
  /** Numera os itens (a ordem importa, como em regras). */
  numbered?: boolean;
  itemLabel?: string;
  emptyText?: string;
}) {
  const [focusIndex, setFocusIndex] = React.useState<number | null>(null);

  const set = (i: number, v: string) => onChange(values.map((x, j) => (j === i ? v : x)));
  const remove = (i: number) => onChange(values.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = values.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {values.length === 0 && emptyText && (
        <p className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">{emptyText}</p>
      )}
      <ol className="space-y-2">
        {values.map((v, i) => (
          <li key={i} className="group flex items-start gap-2 rounded-xl border bg-card p-2">
            {numbered && (
              <span className="mt-2 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {i + 1}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <AutoTextarea
                value={v}
                ariaLabel={`${itemLabel} ${i + 1}`}
                placeholder={placeholder}
                autoFocus={focusIndex === i}
                onChange={(nv) => set(i, nv)}
                // Item vazio ao sair do campo some: não fica "regra em branco".
                onBlur={() => {
                  if (!v.trim()) remove(i);
                  setFocusIndex(null);
                }}
              />
            </div>
            <div className={cn("flex shrink-0 gap-0.5 pt-1", "opacity-100 sm:opacity-60 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100")}>
              {numbered && (
                <>
                  <Button type="button" variant="ghost" size="icon" className="size-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${itemLabel.toLowerCase()} ${i + 1}`}>
                    <IconArrowUp className="size-4" />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="size-8" disabled={i === values.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${itemLabel.toLowerCase()} ${i + 1}`}>
                    <IconArrowDown className="size-4" />
                  </Button>
                </>
              )}
              <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => remove(i)} aria-label={`Remover ${itemLabel.toLowerCase()} ${i + 1}`}>
                <IconTrash className="size-4" />
              </Button>
            </div>
          </li>
        ))}
      </ol>
      <Button
        type="button"
        variant="outline"
        className="gap-1 border-dashed"
        onClick={() => {
          onChange([...values, ""]);
          setFocusIndex(values.length);
        }}
      >
        <IconPlus className="size-4" /> {addLabel}
      </Button>
    </div>
  );
}
