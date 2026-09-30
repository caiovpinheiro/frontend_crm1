"use client"

import { DropdownGlass } from "@/components/crm/dropdown-glass"
import { InputGlass } from "@/components/crm/input-glass"
import { Input } from "@/components/ui/input"
import { BOOL_OPTS } from "@/components/automations/editor-fields"
import { cn } from "@/lib/utils"

const TYPED_FIELD_TYPES = new Set(["SELECT", "MULTI_SELECT", "BOOLEAN", "NUMBER", "DATE"])

/** Hint de variáveis só em texto livre (TEXT/URL/EMAIL/PHONE/desconhecido/nativo). */
export function showsUpdateFieldVariableHint(fieldType: string): boolean {
  return !TYPED_FIELD_TYPES.has((fieldType || "").toUpperCase())
}

export function isUpdateFieldDateType(fieldType: string): boolean {
  return (fieldType || "").toUpperCase() === "DATE"
}

/**
 * Campo DATE: "date" = seletor de calendário (valor fixo); "json" = texto
 * com variáveis `{{…}}` resolvidas quando o passo executar (ex.: `{{now}}`).
 */
export type UpdateFieldDateMode = "date" | "json"

/** Valor salvo com `{{` só pode ter vindo do modo JSON. */
export function inferUpdateFieldDateMode(value: string): UpdateFieldDateMode {
  return value.includes("{{") ? "json" : "date"
}

export const UPDATE_FIELD_DATE_JSON_HINT =
  "Variáveis resolvidas na execução: {{now}} ou {{today}} (data de hoje), {{deal.createdAt}}, {{lastResponse}}…"

export function UpdateFieldDateModeToggle({
  mode,
  onChange,
  variant,
}: {
  mode: UpdateFieldDateMode
  onChange: (next: UpdateFieldDateMode) => void
  variant: "inline" | "panel"
}) {
  const pill = (value: UpdateFieldDateMode, label: string) => (
    <button
      key={value}
      type="button"
      role="radio"
      aria-checked={mode === value}
      className={cn(
        "rounded-full px-2 py-0.5 text-[10.5px] font-semibold leading-none transition-colors",
        variant === "inline" && "nodrag",
        mode === value
          ? "bg-[var(--brand-primary)] text-white"
          : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
      )}
      onClick={(e) => {
        // Dentro de <label>: o clique não pode focar/limpar o input.
        e.preventDefault()
        e.stopPropagation()
        if (mode !== value) onChange(value)
      }}
    >
      {label}
    </button>
  )
  return (
    <span
      role="radiogroup"
      aria-label="Modo do valor"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-0.5"
    >
      {pill("date", "Data")}
      {pill("json", "JSON")}
    </span>
  )
}

function parseMulti(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean)
}

function serializeMulti(selected: string[]): string {
  return selected.join(",")
}

type Props = {
  fieldType: string
  options: string[]
  value: string
  onChange: (next: string) => void
  variant: "inline" | "panel"
  /** Só para campo DATE. Ausente = "date" (comportamento atual). */
  dateMode?: UpdateFieldDateMode
}

export function UpdateFieldValueControl({
  fieldType,
  options,
  value,
  onChange,
  variant,
  dateMode = "date",
}: Props) {
  const type = (fieldType || "").toUpperCase()
  const selectOpts = options.map((opt) => ({ value: opt, label: opt }))
  const triggerClass = variant === "inline" ? "w-full nodrag" : "w-full"
  const inputClass = variant === "inline" ? "nodrag" : undefined

  // Sem alternativas cadastradas: cai no texto livre (mesmo critério das condições).
  if (type === "SELECT" && options.length > 0) {
    return (
      <DropdownGlass
        triggerClassName={triggerClass}
        placeholder="Selecione…"
        value={value}
        options={[{ value: "", label: "Selecione…" }, ...selectOpts]}
        onValueChange={onChange}
      />
    )
  }

  if (type === "MULTI_SELECT" && options.length > 0) {
    const selected = new Set(parseMulti(value))
    const toggle = (opt: string) => {
      const next = new Set(selected)
      if (next.has(opt)) next.delete(opt)
      else next.add(opt)
      // Ordem estável: ordem das options do campo
      onChange(serializeMulti(options.filter((o) => next.has(o))))
    }
    return (
      <div
        className={cn(
          "flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] p-2",
          variant === "inline" && "nodrag nowheel",
        )}
      >
        {options.map((opt) => (
          <label
            key={opt}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12px] text-[var(--text-primary)] hover:bg-[var(--glass-bg-overlay)]"
          >
            <input
              type="checkbox"
              className={cn(
                "size-3.5 accent-[var(--brand-primary)]",
                variant === "inline" && "nodrag",
              )}
              checked={selected.has(opt)}
              onChange={() => toggle(opt)}
            />
            <span className="truncate font-medium">{opt}</span>
          </label>
        ))}
      </div>
    )
  }

  if (type === "BOOLEAN") {
    return (
      <DropdownGlass
        triggerClassName={triggerClass}
        placeholder="Sim/Não"
        value={value}
        options={BOOL_OPTS}
        onValueChange={onChange}
      />
    )
  }

  if (type === "NUMBER") {
    if (variant === "inline") {
      return (
        <InputGlass
          type="number"
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    return (
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  if (type === "DATE") {
    if (dateMode === "json") {
      const placeholder = "{{now}}"
      if (variant === "inline") {
        return (
          <InputGlass
            className={cn(inputClass, "font-mono")}
            placeholder={placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        )
      }
      return (
        <Input
          className="font-mono"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    if (variant === "inline") {
      return (
        <InputGlass
          type="date"
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )
    }
    return (
      <Input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }

  // TEXT / URL / EMAIL / PHONE / desconhecido / nativo
  if (variant === "inline") {
    return (
      <InputGlass
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
