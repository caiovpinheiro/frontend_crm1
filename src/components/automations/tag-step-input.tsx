"use client"

import { InputGlass } from "@/components/crm/input-glass"
import { cn } from "@/lib/utils"
import { useTagOptions } from "./editor-data"

type Props = {
  label: string
  optional?: boolean
  value: string
  onChange: (v: string) => void
  /** `add_tag` permite nome novo; `remove_tag` só escolhe tag da org. */
  allowCreate?: boolean
}

/**
 * Campo do passo add/remove tag: lista as tags da org logada e filtra
 * conforme o operador digita. A lista fica visível ao montar o node
 * (não depende de foco) para o card crescer sem dropdown cortado.
 */
export function TagStepInput({
  label,
  optional,
  value,
  onChange,
  allowCreate = true,
}: Props) {
  const { options, isLoading, isError } = useTagOptions()
  const q = value.trim().toLowerCase()
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q))
    : options
  const exists = options.some((o) => o.value.toLowerCase() === q)

  const choose = (next: string) => onChange(next)

  return (
    <div className="cfg-field">
      <span className="cfg-label">
        {label}
        {optional && <em className="cfg-opt">opcional</em>}
      </span>
      <div className="cfg-combo">
        <InputGlass
          className="cfg-input nodrag"
          value={value}
          autoComplete="off"
          placeholder={
            isLoading
              ? "Carregando tags…"
              : allowCreate
                ? "Buscar ou criar tag…"
                : "Digite para filtrar as tags…"
          }
          onChange={(e) => onChange(e.target.value)}
        />
        <div
          className="cfg-pop cfg-pop--inplace nowheel nopan"
          role="listbox"
          aria-label="Tags da organização"
        >
          {isLoading && <div className="cfg-pop-empty">Carregando tags…</div>}
          {isError && !isLoading && (
            <div className="cfg-pop-empty">Não foi possível carregar as tags.</div>
          )}
          {!isLoading && !isError && filtered.length === 0 && (
            <div className="cfg-pop-empty">
              {q
                ? allowCreate
                  ? "Nenhuma tag corresponde — use o botão abaixo para criar."
                  : "Nenhuma tag corresponde ao que você digitou."
                : "Nenhuma tag cadastrada nesta organização."}
            </div>
          )}
          {filtered.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={cn("cfg-pop-item nodrag", o.value === value && "on")}
              onMouseDown={(e) => {
                e.preventDefault()
                choose(o.value)
              }}
            >
              <span
                className="cfg-pop-dot"
                style={o.color ? { background: o.color } : undefined}
              />
              {highlightMatch(o.label, q)}
            </button>
          ))}
          {allowCreate && value.trim() && !exists && (
            <button
              type="button"
              className="cfg-pop-item create nodrag"
              onMouseDown={(e) => {
                e.preventDefault()
                choose(value.trim())
              }}
            >
              + Criar tag “{value.trim()}”
            </button>
          )}
        </div>
      </div>
      <span className="cfg-hint">
        {allowCreate
          ? "Selecione uma tag existente ou digite para criar uma nova."
          : "Digite para filtrar as tags da organização."}
      </span>
    </div>
  )
}

function highlightMatch(label: string, query: string) {
  if (!query) return label
  const idx = label.toLowerCase().indexOf(query)
  if (idx < 0) return label
  return (
    <span>
      {label.slice(0, idx)}
      <mark className="rounded-sm bg-primary/15 text-inherit">{label.slice(idx, idx + query.length)}</mark>
      {label.slice(idx + query.length)}
    </span>
  )
}
