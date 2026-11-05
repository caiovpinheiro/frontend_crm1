"use client"

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ComponentProps } from "react"
import { createPortal } from "react-dom"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  WEBHOOK_VARIABLE_OPTIONS,
  buildCustomFieldOptions,
} from "@/lib/automation-webhook-variables"
import { useCustomFieldTokens } from "@/components/automations/editor-data"

export type FlowVarOpt = {
  token: string
  label: string
  hint?: string
  group: string
}

const GROUP_ORDER = [
  "Contato",
  "Negócio",
  "Produto",
  "Conversa",
  "Responsável",
  "Fluxo",
  "Tags",
  "Anúncio (Meta CTWA)",
] as const

// "Produto do negócio" só resolve no passo Webhook (o backend carrega os
// produtos lá); nas mensagens o produto é `{{produto.*}}`, do Enviar produto.
const SKIP_WEBHOOK_GROUPS = new Set(["Evento", "Automação", "Sistema", "Produto do negócio"])

const EXTRA_OPTIONS: FlowVarOpt[] = [
  { group: "Contato", token: "{{contact.name|first_name}}", label: "Primeiro nome do contato" },
  { group: "Produto", token: "{{produto.nome}}", label: "Nome do produto" },
  { group: "Produto", token: "{{produto.preco}}", label: "Preço do produto", hint: "Formatado em R$" },
  { group: "Produto", token: "{{produto.sku}}", label: "SKU do produto" },
  { group: "Produto", token: "{{produto.descricao}}", label: "Descrição do produto" },
  { group: "Produto", token: "{{produto.unidade}}", label: "Unidade do produto" },
  {
    group: "Responsável",
    token: "{{assignee.name}}",
    label: "Nome do responsável",
    hint: "Consultor da conversa; senão, dono do negócio",
  },
  { group: "Responsável", token: "{{assignee.name|first_name}}", label: "Primeiro nome do responsável" },
  {
    group: "Fluxo",
    token: "{{lastResponse}}",
    label: "Última resposta do contato",
    hint: "Resposta do último passo interativo",
  },
  { group: "Fluxo", token: "{{lastResponse|first_name}}", label: "Primeiro nome da última resposta" },
]

export function useFlowVariableOptions(): FlowVarOpt[] {
  const { contact, deal } = useCustomFieldTokens()
  return useMemo(() => {
    const fromWebhook: FlowVarOpt[] = WEBHOOK_VARIABLE_OPTIONS.filter(
      (o) => !SKIP_WEBHOOK_GROUPS.has(o.group),
    ).map((o) => ({ token: o.token, label: o.label, hint: o.hint, group: o.group }))

    const customs = buildCustomFieldOptions([
      ...contact.map((c) => ({ name: c.name ?? "", label: c.label, entity: "contact" })),
      ...deal.map((d) => ({ name: d.name ?? "", label: d.label, entity: "deal" })),
    ]).map((o) => ({ token: o.token, label: o.label, hint: o.hint, group: o.group }))

    const seen = new Set<string>()
    const out: FlowVarOpt[] = []
    for (const opt of [...fromWebhook, ...customs, ...EXTRA_OPTIONS]) {
      if (seen.has(opt.token)) continue
      seen.add(opt.token)
      out.push(opt)
    }
    return out
  }, [contact, deal])
}

export function useVariableTrigger(value: string, onChange: (v: string) => void) {
  const options = useFlowVariableOptions()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [startPos, setStartPos] = useState<number | null>(null)
  const [active, setActive] = useState(0)
  const closeT = useRef<ReturnType<typeof setTimeout> | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.token.toLowerCase().includes(q) ||
        o.group.toLowerCase().includes(q) ||
        (o.hint?.toLowerCase().includes(q) ?? false),
    )
  }, [options, query])

  const grouped = useMemo(() => {
    const map = new Map<string, FlowVarOpt[]>()
    for (const opt of filtered) {
      const list = map.get(opt.group) ?? []
      list.push(opt)
      map.set(opt.group, list)
    }
    const keys = [
      ...GROUP_ORDER.filter((g) => map.has(g)),
      ...[...map.keys()].filter((g) => !(GROUP_ORDER as readonly string[]).includes(g)),
    ]
    return keys.map((group) => ({ group, items: map.get(group) ?? [] })).filter((g) => g.items.length > 0)
  }, [filtered])

  const close = useCallback(() => {
    setOpen(false)
    setQuery("")
    setStartPos(null)
    setActive(0)
  }, [])

  const refresh = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement) => {
      const caret = el.selectionStart ?? el.value.length
      const left = el.value.slice(0, caret)
      const trigger = Math.max(left.lastIndexOf("["), left.lastIndexOf("{"))
      if (trigger < 0) return close()
      let start = trigger
      const typed = left.slice(trigger + 1)
      if (typed.includes("\n")) return close()
      if (left[trigger] === "{") {
        while (start > 0 && left[start - 1] === "{") start -= 1
        if (typed.includes("}")) return close()
      } else if (typed.includes("]")) {
        return close()
      }
      setStartPos(start)
      setQuery(typed)
      setActive(0)
      setOpen(true)
    },
    [close],
  )

  const apply = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null, token: string) => {
      if (!el || startPos == null) return
      const caret = el.selectionStart ?? value.length
      const next = `${value.slice(0, startPos)}${token}${value.slice(caret)}`
      onChange(next)
      close()
      requestAnimationFrame(() => {
        const pos = startPos + token.length
        el.focus()
        el.setSelectionRange(pos, pos)
      })
    },
    [close, onChange, startPos, value],
  )

  const applyActive = useCallback(
    (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      const token = filtered[active]?.token ?? filtered[0]?.token
      if (token) apply(el, token)
    },
    [active, apply, filtered],
  )

  const move = useCallback(
    (delta: number) => {
      if (filtered.length === 0) return
      setActive((i) => (i + delta + filtered.length) % filtered.length)
    },
    [filtered.length],
  )

  return { open, filtered, grouped, active, setActive, closeT, refresh, apply, applyActive, move, setOpen, close }
}

export function VariablePickerMenu({
  open,
  grouped,
  filtered,
  active,
  onPick,
  onHover,
  anchor,
}: {
  open: boolean
  grouped: { group: string; items: FlowVarOpt[] }[]
  filtered: FlowVarOpt[]
  active: number
  onPick: (token: string) => void
  onHover?: (index: number) => void
  anchor?: HTMLElement | null
}) {
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setBox(null)
      return
    }
    const update = () => {
      const r = anchor.getBoundingClientRect()
      setBox({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 260) })
    }
    update()
    window.addEventListener("scroll", update, true)
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update, true)
      window.removeEventListener("resize", update)
    }
  }, [open, anchor])

  if (!open || filtered.length === 0) return null
  let index = -1
  const menu = (
    <div
      className="nodrag nopan nowheel max-h-64 overflow-auto rounded-lg border border-[#E2E8F0] py-1 shadow-[0_8px_24px_rgba(15,23,42,0.16)]"
      style={{
        position: "fixed",
        top: box?.top ?? 0,
        left: box?.left ?? 0,
        width: box?.width ?? 260,
        zIndex: 10000,
        background: "#ffffff",
        color: "#0f172a",
      }}
    >
      {grouped.map((g) => (
        <div key={g.group}>
          <p
            className="sticky top-0 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ background: "#ffffff", color: "#64748b" }}
          >
            {g.group}
          </p>
          {g.items.map((o) => {
            index += 1
            const i = index
            return (
              <button
                key={o.token}
                type="button"
                title={o.token}
                className="flex w-full flex-col px-2.5 py-1.5 text-left"
                style={{
                  background: i === active ? "#f1f5f9" : "transparent",
                  color: "#0f172a",
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  onPick(o.token)
                }}
                onMouseEnter={() => onHover?.(i)}
              >
                <span className="truncate text-[12px] font-medium" style={{ color: "#0f172a" }}>
                  {o.label}
                </span>
                {o.hint ? (
                  <span className="truncate text-[10px]" style={{ color: "#64748b" }}>
                    {o.hint}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
  if (typeof document === "undefined") return menu
  return createPortal(menu, document.body)
}

export function FlowVariableInput({
  value,
  onChange,
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, "onChange" | "value"> & {
  value: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const vars = useVariableTrigger(value, onChange)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setAnchor(vars.open ? ref.current : null)
  }, [vars.open])
  return (
    <div className="relative">
      <Input
        {...props}
        ref={ref}
        value={value}
        className={cn("nodrag nopan", className)}
        onChange={(e) => {
          onChange(e.target.value)
          vars.refresh(e.target)
        }}
        onKeyUp={(e) => vars.refresh(e.currentTarget)}
        onClick={(e) => vars.refresh(e.currentTarget)}
        onFocus={() => {
          if (vars.closeT.current) clearTimeout(vars.closeT.current)
        }}
        onBlur={(e) => {
          vars.closeT.current = setTimeout(() => vars.setOpen(false), 160)
          props.onBlur?.(e)
        }}
        onKeyDown={(e) => {
          if (!vars.open) return
          if (e.key === "ArrowDown") {
            e.preventDefault()
            vars.move(1)
          } else if (e.key === "ArrowUp") {
            e.preventDefault()
            vars.move(-1)
          } else if (e.key === "Enter") {
            e.preventDefault()
            vars.applyActive(e.currentTarget)
          } else if (e.key === "Escape") {
            e.preventDefault()
            vars.close()
          }
        }}
      />
      <VariablePickerMenu
        open={vars.open}
        grouped={vars.grouped}
        filtered={vars.filtered}
        active={vars.active}
        anchor={anchor}
        onPick={(token) => vars.apply(ref.current, token)}
        onHover={vars.setActive}
      />
    </div>
  )
}
