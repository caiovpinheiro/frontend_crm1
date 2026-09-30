"use client"

/**
 * Encaminhar mensagem — diálogo com busca e seleção múltipla de conversas
 * (paridade com o ChatWindow legado, que só permitia um destino por clique).
 *
 * Lista: GET /api/conversations?perPage=80 (`listConversationsForForwardPicker`).
 * Envio: POST /api/conversations/:target/forward, um por destino, em
 * sequência (`useForwardMessage`). Mídias vão como aviso no texto — regra
 * do backend.
 */

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  IconLoader2,
  IconSearch,
  IconSend2,
  IconSquare,
  IconSquareCheckFilled,
} from "@tabler/icons-react"

import type { Message } from "@/components/crm/message-bubble"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { listConversationsForForwardPicker, type ConversationListRow } from "@/features/inbox-v2/api"
import { useForwardMessage } from "@/features/inbox-v2/hooks/use-messages"
import { formatPhoneDisplay } from "@/lib/phone"
import { cn } from "@/lib/utils"

export type ForwardPickRow = Pick<ConversationListRow, "id" | "number" | "channel" | "contact" | "status">

/** Busca por nome (sem acento/caixa) ou por dígitos do telefone; nunca a origem. */
export function filterForwardRows<T extends ForwardPickRow>(
  rows: T[],
  query: string,
  excludeConversationId?: string | null,
): T[] {
  const q = query.trim().toLowerCase()
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  const qNorm = norm(q)
  const qDigits = q.replace(/\D/g, "")
  return rows.filter((r) => {
    if (excludeConversationId && r.id === excludeConversationId) return false
    if (!q) return true
    const name = norm(r.contact?.name ?? "")
    if (qNorm && name.includes(qNorm)) return true
    const phone = (r.contact?.phone ?? "").replace(/\D/g, "")
    return qDigits.length > 0 && phone.includes(qDigits)
  })
}

function channelLabel(channel: string | null | undefined): string {
  const c = (channel ?? "").toLowerCase()
  if (c.includes("whatsapp")) return "WhatsApp"
  if (c.includes("instagram")) return "Instagram"
  if (c.includes("meta") || c.includes("facebook")) return "Messenger"
  if (c.includes("email")) return "E-mail"
  return channel || "Canal"
}

/** Lista de destinos com checkbox — separada do Dialog para ser testável sem portal. */
export function ForwardPickerList({
  rows,
  selected,
  onToggle,
  disabled,
}: {
  rows: ForwardPickRow[]
  selected: ReadonlySet<string>
  onToggle: (id: string) => void
  disabled?: boolean
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">Nenhuma conversa encontrada.</p>
    )
  }
  return (
    <ul className="flex list-none flex-col gap-0.5" role="listbox" aria-multiselectable="true" aria-label="Conversas de destino">
      {rows.map((row) => {
        const checked = selected.has(row.id)
        const phone = formatPhoneDisplay(row.contact?.phone ?? null)
        const meta = [
          phone || "—",
          channelLabel(row.channel),
          row.number != null ? `#${row.number}` : null,
          row.status === "RESOLVED" ? "encerrada" : null,
        ]
          .filter(Boolean)
          .join(" · ")
        return (
          <li key={row.id}>
            <button
              type="button"
              role="option"
              aria-selected={checked}
              disabled={disabled}
              onClick={() => onToggle(row.id)}
              data-forward-target={row.id}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-[var(--radius-md)] px-2.5 py-2 text-left transition-colors disabled:opacity-50",
                checked
                  ? "bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)]"
                  : "hover:bg-[var(--glass-bg-overlay)]",
              )}
            >
              {checked ? (
                <IconSquareCheckFilled size={18} className="shrink-0 text-[var(--brand-primary)]" aria-hidden />
              ) : (
                <IconSquare size={18} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[13px] font-semibold text-[var(--text-primary)]">
                  {row.contact?.name?.trim() || "Sem nome"}
                </span>
                <span className="block truncate text-[11.5px] text-[var(--text-muted)]">{meta}</span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function ForwardDialog({
  open,
  onOpenChange,
  message,
  sourceConversationId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Mensagem a encaminhar (`message.id` é o `messageRef` do backend). */
  message: Message | null
  sourceConversationId: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {/* O corpo desmonta ao fechar (Radix Presence): busca/seleção
            começam limpas a cada abertura sem effect de reset. */}
        <ForwardDialogBody
          message={message}
          sourceConversationId={sourceConversationId}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  )
}

function ForwardDialogBody({
  message,
  sourceConversationId,
  onOpenChange,
}: {
  message: Message | null
  sourceConversationId: string
  onOpenChange: (open: boolean) => void
}) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [sending, setSending] = useState(false)
  const forward = useForwardMessage(sourceConversationId)

  const { data, isLoading, isError } = useQuery({
    queryKey: ["inbox-v2", "forward-picker"],
    queryFn: listConversationsForForwardPicker,
    staleTime: 30_000,
  })
  const rows = useMemo(
    () => filterForwardRows(data?.items ?? [], query, sourceConversationId),
    [data?.items, query, sourceConversationId],
  )

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const handleSend = async () => {
    if (!message || selected.size === 0 || sending) return
    setSending(true)
    const targets = Array.from(selected)
    let ok = 0
    const warnings: string[] = []
    const errors: string[] = []
    for (const targetConversationId of targets) {
      try {
        const res = await forward.mutateAsync({ targetConversationId, messageRef: String(message.id) })
        ok += 1
        if (res.metaError) warnings.push(res.metaError)
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Erro ao encaminhar")
      }
    }
    setSending(false)
    if (ok > 0) {
      toast.success(ok === 1 ? "Mensagem encaminhada." : `Mensagem encaminhada para ${ok} conversas.`)
    }
    if (warnings.length > 0) {
      toast.warning(`Encaminhado salvo; WhatsApp: ${warnings[0]}`)
    }
    if (errors.length > 0) {
      toast.error(errors.length === 1 ? errors[0] : `${errors.length} envios falharam: ${errors[0]}`)
    }
    if (errors.length === 0) onOpenChange(false)
  }

  const preview = (message?.content ?? "").trim()

  return (
    <>
      <DialogHeader>
        <DialogTitle>Encaminhar mensagem</DialogTitle>
        <DialogDescription>
          O texto será enviado para o contato de cada conversa escolhida.
          Mídias aparecem apenas como aviso no texto.
        </DialogDescription>
      </DialogHeader>

      {preview ? (
        <blockquote className="line-clamp-3 rounded-[var(--radius-md)] border-l-2 border-[var(--brand-primary)] bg-[var(--glass-bg-subtle)] px-3 py-2 text-[12.5px] text-[var(--text-secondary)]">
          {preview}
        </blockquote>
      ) : null}

      <label className="flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-subtle)] px-3 py-1.5">
        <IconSearch size={14} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou telefone…"
          aria-label="Buscar conversa de destino"
          autoFocus
          className="min-w-0 flex-1 bg-transparent font-display text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
        />
      </label>

      <div className="max-h-64 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--glass-border)] p-1">
        {isLoading ? (
          <div className="flex justify-center py-6" role="status" aria-label="Carregando conversas">
            <IconLoader2 size={22} className="animate-spin text-[var(--text-muted)]" />
          </div>
        ) : isError ? (
          <p className="py-6 text-center text-[13px] text-[var(--color-danger)]">Não foi possível carregar as conversas.</p>
        ) : (
          <ForwardPickerList rows={rows} selected={selected} onToggle={toggle} disabled={sending} />
        )}
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          disabled={sending}
          className="inline-flex h-9 items-center rounded-full border border-[var(--glass-border)] px-4 font-display text-[12.5px] font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || selected.size === 0 || !message}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[var(--brand-primary)] px-4 font-display text-[12.5px] font-semibold text-white shadow-[0_2px_8px_rgba(91,111,245,0.35)] transition-colors hover:bg-[var(--brand-primary-dark)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <IconLoader2 size={14} className="animate-spin" aria-hidden /> : <IconSend2 size={14} aria-hidden />}
          {selected.size > 1 ? `Encaminhar (${selected.size})` : "Encaminhar"}
        </button>
      </DialogFooter>
    </>
  )
}
