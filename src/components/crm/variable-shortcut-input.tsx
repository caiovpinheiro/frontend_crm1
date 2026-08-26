"use client";

/**
 * Campo de uma linha com o atalho de variáveis do CRM: digitar `{` (ou `[`,
 * gatilho legado) abre a lista de tokens — `{{contact.name}}`,
 * `{{dealCustomFields.<campo>}}`, etc.
 *
 * Mesmo gatilho e MESMO formato de token do bloco "Variáveis do template" do
 * construtor de automação (`components/automations/step-config-panel.tsx`).
 * Quem resolve o token no envio é o interpolador do backend
 * (`interpolateTemplateComponents` no executor de automações), então os dois
 * lados têm de oferecer exatamente o mesmo vocabulário — um segundo formato de
 * token viraria texto literal na mensagem do contato.
 */

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { apiUrl } from "@/lib/api";
import { InputGlass } from "@/components/crm/input-glass";

export type CrmVariableOption = { label: string; token: string; hint?: string };

type CustomFieldRow = { name: string; label?: string | null };

async function fetchCustomFields(entity: "contact" | "deal"): Promise<CustomFieldRow[]> {
  const res = await fetch(apiUrl(`/api/custom-fields?entity=${entity}`));
  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

/**
 * Tokens do CRM disponíveis para preencher variável de template: dados do
 * contato/negócio e os campos personalizados das duas entidades.
 */
export function useCrmVariableOptions(enabled: boolean): CrmVariableOption[] {
  const { data } = useQuery({
    queryKey: ["crm-variable-shortcut-fields"],
    enabled,
    staleTime: 2 * 60_000,
    queryFn: async () => {
      const [contacts, deals] = await Promise.all([
        fetchCustomFields("contact"),
        fetchCustomFields("deal"),
      ]);
      return { contacts, deals };
    },
  });

  return React.useMemo<CrmVariableOption[]>(() => {
    const out: CrmVariableOption[] = [
      { label: "Nome do contato", token: "{{contact.name}}" },
      {
        label: "Primeiro nome do contato",
        token: "{{contact.name|first_name}}",
        hint: "Filtra só o primeiro nome",
      },
      { label: "Telefone do contato", token: "{{contact.phone}}" },
      { label: "E-mail do contato", token: "{{contact.email}}" },
      { label: "Título do negócio", token: "{{deal.title}}" },
      { label: "Valor do negócio", token: "{{deal.value}}" },
      {
        label: "Responsável do lead",
        token: "{{assignee.name}}",
        hint: "Consultor da conversa; sem ele, o dono do negócio",
      },
    ];
    for (const cf of data?.contacts ?? []) {
      out.push({
        label: `Contato: ${cf.label || cf.name}`,
        token: `{{contactCustomFields.${cf.name}}}`,
        hint: "Campo personalizado do contato",
      });
    }
    for (const cf of data?.deals ?? []) {
      out.push({
        label: `Negócio: ${cf.label || cf.name}`,
        token: `{{dealCustomFields.${cf.name}}}`,
        hint: "Campo personalizado do negócio",
      });
    }
    return out;
  }, [data]);
}

export function VariableShortcutHint() {
  return (
    <p className="text-[11px] text-[var(--text-muted)]">
      Atalho: digite <span className="font-mono">{"{"}</span> para abrir a lista de campos do
      CRM.
    </p>
  );
}

export function VariableShortcutInput({
  id,
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  id?: string;
  value: string;
  onChange: (next: string) => void;
  options: CrmVariableOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [startPos, setStartPos] = React.useState<number | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 20);
    return options
      .filter((o) => o.label.toLowerCase().includes(q) || o.token.toLowerCase().includes(q))
      .slice(0, 20);
  }, [options, query]);

  const refreshShortcutState = (el: HTMLInputElement) => {
    const close = () => {
      setOpen(false);
      setQuery("");
      setStartPos(null);
    };
    const caret = el.selectionStart ?? el.value.length;
    const left = el.value.slice(0, caret);
    const triggerStart = Math.max(left.lastIndexOf("["), left.lastIndexOf("{"));
    if (triggerStart < 0) return close();

    let start = triggerStart;
    const typed = left.slice(triggerStart + 1);
    if (left[triggerStart] === "{") {
      // Absorve as chaves já digitadas ("{{") para o token inserido não
      // duplicar a abertura.
      while (start > 0 && left[start - 1] === "{") start -= 1;
      if (typed.includes("}")) return close();
    } else if (typed.includes("]")) {
      return close();
    }
    setStartPos(start);
    setQuery(typed);
    setOpen(true);
  };

  const applyToken = (token: string) => {
    const el = inputRef.current;
    if (!el || startPos == null) return;
    const caret = el.selectionStart ?? value.length;
    const next = `${value.slice(0, startPos)}${token}${value.slice(caret)}`;
    onChange(next);
    setOpen(false);
    setQuery("");
    setStartPos(null);
    requestAnimationFrame(() => {
      const pos = startPos + token.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative">
      <InputGlass
        id={id}
        ref={inputRef}
        className={className}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          refreshShortcutState(e.target);
        }}
        onKeyUp={(e) => refreshShortcutState(e.currentTarget)}
        onClick={(e) => refreshShortcutState(e.currentTarget)}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
        }}
      />
      {open && filtered.length > 0 ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--color-bg-card)] p-1 shadow-[var(--shadow-lg)]">
          {filtered.map((opt) => (
            <button
              key={`${opt.label}-${opt.token}`}
              type="button"
              className="flex w-full items-start gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-bg-subtle)]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyToken(opt.token)}
            >
              <span className="mt-0.5 rounded bg-[var(--glass-bg-base)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-primary)]">
                {opt.token}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-semibold text-[var(--text-primary)]">
                  {opt.label}
                </span>
                {opt.hint ? (
                  <span className="block truncate text-[10px] text-[var(--text-muted)]">
                    {opt.hint}
                  </span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
