"use client";

import { KeyRound } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formControlClass, formLabelClass } from "@/components/ui/form-dialog";
import { cn } from "@/lib/utils";

import { FieldHelp } from "./section-header";

/**
 * Campo da chave OpenAI do agente.
 *
 * O CRM é multi-tenant: cada agente usa a própria conta OpenAI, não há
 * chave global no `.env`. Sem chave o agente não responde.
 *
 * - `value` é só o buffer de digitação. Envie ao backend apenas quando
 *   o usuário digitou algo (`value.trim()`).
 * - `hasSavedKey` + `savedHint` vêm do GET (`hasOwnOpenaiKey` /
 *   `openaiApiKeyHint`). A chave cifrada nunca chega ao front.
 * - `onClear` → PUT com `openaiApiKey: null` (remove a chave salva).
 */
export function OpenAiKeyField({
  value,
  onChange,
  onClear,
  hasSavedKey = false,
  savedHint = null,
  idPrefix = "ag",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onClear?: () => void;
  hasSavedKey?: boolean;
  savedHint?: string | null;
  idPrefix?: string;
  className?: string;
}) {
  const [editing, setEditing] = React.useState(!hasSavedKey);

  React.useEffect(() => {
    // Se o agente recarregar já com chave salva, volta pro modo "salva".
    if (hasSavedKey && value.trim() === "") setEditing(false);
  }, [hasSavedKey, value]);

  const showInput = editing || !hasSavedKey;

  return (
    <div className={className}>
      <label htmlFor={`${idPrefix}-openai-key`} className={formLabelClass}>
        <span className="flex items-center gap-1.5">
          <KeyRound className="size-3.5" />
          Chave OpenAI do agente
        </span>
      </label>

      {showInput ? (
        <>
          <Input
            id={`${idPrefix}-openai-key`}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="sk-…"
            className={cn(formControlClass, "font-mono")}
          />
          {hasSavedKey && (
            <button
              type="button"
              onClick={() => {
                onChange("");
                setEditing(false);
              }}
              className="mt-1 text-xs font-medium text-primary hover:underline"
            >
              Manter a chave atual
            </button>
          )}
        </>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <span className="font-mono text-xs text-muted-foreground">
            Chave salva · sk-…{savedHint ?? "••••"}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={() => setEditing(true)}
            >
              Trocar
            </Button>
            {onClear && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="rounded-full text-destructive hover:text-destructive"
                onClick={() => {
                  onChange("");
                  onClear();
                }}
              >
                Remover
              </Button>
            )}
          </div>
        </div>
      )}

      <FieldHelp>
        Cada agente usa a própria conta OpenAI. Sem chave, o agente não
        responde. A chave fica cifrada no banco e nunca volta para a tela.
      </FieldHelp>
    </div>
  );
}
