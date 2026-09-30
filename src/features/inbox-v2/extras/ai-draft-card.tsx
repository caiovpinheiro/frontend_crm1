"use client"

/**
 * Card de rascunho gerado por agente de IA em modo DRAFT (`ai_draft`),
 * inline na timeline do chat canônico — adaptado de
 * `components/inbox/ai-draft-card.tsx` (ChatWindow legado) para os hooks
 * do inbox-v2 e os tokens do tema.
 *
 * O operador pode aprovar (opcionalmente editando o texto antes) ou
 * descartar; nos dois casos a conversa é refeita e o card some.
 */

import { useState } from "react"
import { IconCheck, IconLoader2, IconPencil, IconRobot, IconX } from "@tabler/icons-react"

import { useApproveAiDraft, useDiscardAiDraft } from "@/features/inbox-v2/hooks/use-messages"
import { cn } from "@/lib/utils"

export function AIDraftCard({
  messageId,
  content,
  time,
  senderName,
  conversationId,
  className,
}: {
  messageId: string
  content: string
  /** "HH:mm" já formatado pelo adapter. */
  time?: string | null
  senderName?: string | null
  conversationId: string | null
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)
  const [error, setError] = useState<string | null>(null)

  const approve = useApproveAiDraft(conversationId)
  const discard = useDiscardAiDraft(conversationId)
  const busy = approve.isPending || discard.isPending
  const canApprove = !busy && draft.trim().length > 0

  const handleApprove = () => {
    setError(null)
    approve.mutate(
      { messageId, content: draft.trim() === content.trim() ? undefined : draft },
      { onError: (e) => setError(e instanceof Error ? e.message : "Falha ao enviar.") },
    )
  }
  const handleDiscard = () => {
    setError(null)
    discard.mutate(
      { messageId },
      { onError: (e) => setError(e instanceof Error ? e.message : "Falha ao descartar.") },
    )
  }

  const actionBtn =
    "inline-flex h-7 items-center gap-1 rounded-full px-2.5 font-display text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <div
      data-ai-draft-card={messageId}
      className={cn("flex w-full justify-end", className)}
    >
      <div className="w-full max-w-[92%] rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_7%,var(--glass-bg-base))] p-3 text-sm shadow-[var(--glass-shadow-sm)] md:max-w-[85%]">
        <div className="mb-2 flex items-center gap-2 font-display text-[10px] font-bold uppercase tracking-widest text-[var(--brand-primary)]">
          <IconRobot size={14} aria-hidden />
          Rascunho do agente IA
          {senderName ? (
            <span className="normal-case tracking-normal text-[var(--brand-primary)]/80">· {senderName}</span>
          ) : null}
          {time ? (
            <time className="ml-auto font-mono text-[10px] font-medium normal-case tracking-normal text-[var(--text-muted)]">
              {time}
            </time>
          ) : null}
        </div>

        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, Math.max(3, draft.split("\n").length))}
            disabled={busy}
            aria-label="Editar rascunho"
            className="w-full resize-none rounded-md border border-[color-mix(in_srgb,var(--brand-primary)_35%,transparent)] bg-[var(--glass-bg-base)] px-2 py-1.5 text-sm leading-[1.45] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
          />
        ) : (
          <p className="whitespace-pre-wrap leading-[1.45] text-[var(--text-primary)]">{draft}</p>
        )}

        {error ? (
          <p role="alert" className="mt-2 rounded-md bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)] px-2 py-1 text-[11px] text-[var(--color-danger)]">
            {error}
          </p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={handleDiscard}
            disabled={busy}
            className={cn(actionBtn, "text-[var(--color-danger)] hover:bg-[color-mix(in_srgb,var(--color-danger)_10%,transparent)]")}
          >
            {discard.isPending ? <IconLoader2 size={13} className="animate-spin" aria-hidden /> : <IconX size={13} aria-hidden />}
            Descartar
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            disabled={busy}
            className={cn(actionBtn, "border border-[var(--glass-border)] text-[var(--text-secondary)] hover:bg-[var(--glass-bg-overlay)]")}
          >
            <IconPencil size={13} aria-hidden />
            {editing ? "Cancelar edição" : "Editar"}
          </button>
          <button
            type="button"
            onClick={handleApprove}
            disabled={!canApprove}
            className={cn(actionBtn, "bg-[var(--brand-primary)] text-white shadow-[0_2px_8px_rgba(91,111,245,0.35)] hover:bg-[var(--brand-primary-dark)]")}
          >
            {approve.isPending ? <IconLoader2 size={13} className="animate-spin" aria-hidden /> : <IconCheck size={13} aria-hidden />}
            Aprovar e enviar
          </button>
        </div>
      </div>
    </div>
  )
}
