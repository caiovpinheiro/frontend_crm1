"use client"

/**
 * Linhas de evento da Meta na timeline do chat canônico (portadas do
 * ChatWindow legado, sem framer-motion e com tokens do tema):
 *
 *   - `SystemEventRow`: webhook `type: "system"` (ex.: `user_changed_number`).
 *     Detecta "… from <antigo> to <novo>" e mostra os dois números; outros
 *     eventos caem num chip discreto.
 *   - `ConsentEventRow`: resposta ao pedido de permissão de ligação
 *     (Meta Calling API — concedida temporária/permanente, recusada, genérica).
 */

import {
  IconAlertCircle,
  IconArrowRight,
  IconDeviceMobile,
  IconPhone,
  IconPhoneOff,
  IconShieldCheck,
} from "@tabler/icons-react"

import type { ConsentVerdict } from "@/components/crm/chat-timeline"
import { formatPhoneDisplay } from "@/lib/phone"
import { cn } from "@/lib/utils"

const NUMBER_CHANGE_RE = /from\s+(\+?\d[\d\s-]{6,})\s+to\s+(\+?\d[\d\s-]{6,})/i

/** "USER A CHANGED FROM 5511… TO 5511…" → os dois números. */
export function parseNumberChange(
  body: string | null | undefined,
): { from: string; to: string } | null {
  const m = (body ?? "").match(NUMBER_CHANGE_RE)
  if (!m) return null
  return { from: m[1].trim(), to: m[2].trim() }
}

/** Texto exibido para eventos antigos gravados só como "[system]". */
export function systemEventBody(raw: string | null | undefined): string {
  const t = (raw ?? "").trim()
  if (!t || t === "[system]" || t === "[Sistema]") {
    return "Evento do sistema WhatsApp. Mensagens antigas não tinham o texto; as novas mostram o aviso da Meta (ex.: cliente alterou o número)."
  }
  return t
}

const WARN_CARD =
  "border-[color-mix(in_srgb,var(--color-warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_10%,var(--glass-bg-base))]"

export function SystemEventRow({
  body,
  time,
  className,
}: {
  body: string | null | undefined
  time?: string | null
  className?: string
}) {
  const text = systemEventBody(body)
  const change = parseNumberChange(text)

  if (change) {
    return (
      <div
        role="status"
        data-chat-system-event="number-change"
        className={cn("flex w-full justify-center py-2", className)}
      >
        <div className={cn("flex max-w-[520px] flex-col items-stretch gap-2 rounded-2xl border px-4 py-3 shadow-[var(--glass-shadow-sm)]", WARN_CARD)}>
          <div className="flex items-center gap-2">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-warning)_18%,transparent)] text-[var(--color-warning)]">
              <IconDeviceMobile size={14} stroke={2.4} aria-hidden />
            </span>
            <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warning)]">
              Cliente trocou de número
            </p>
            {time ? (
              <time className="ml-auto text-[10px] font-semibold tabular-nums text-[var(--color-warning)]/80">
                {time}
              </time>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 px-1">
            <span className="rounded-md bg-[var(--glass-bg-subtle)] px-2 py-1 text-[12px] font-bold tabular-nums text-[var(--text-muted)] line-through decoration-[var(--text-muted)]/60">
              {formatPhoneDisplay(change.from)}
            </span>
            <IconArrowRight size={14} stroke={2.5} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
            <span className="rounded-md bg-[var(--glass-bg-overlay)] px-2 py-1 text-[12px] font-bold tabular-nums text-[var(--text-primary)] shadow-[var(--glass-shadow-sm)]">
              {formatPhoneDisplay(change.to)}
            </span>
          </div>
          <p className="text-center text-[10px] font-semibold text-[var(--color-warning)]/80">
            Histórico preservado · Cadastro atualizado automaticamente
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="status"
      data-chat-system-event="generic"
      className={cn("flex w-full justify-center py-2", className)}
    >
      <div className={cn("flex max-w-[420px] items-center gap-2 rounded-full border px-3 py-1.5 shadow-[var(--glass-shadow-sm)]", WARN_CARD)}>
        <IconAlertCircle size={14} stroke={2.4} className="shrink-0 text-[var(--color-warning)]" aria-hidden />
        <p className="text-[11px] font-semibold text-[var(--color-warning)]">{text}</p>
        {time ? (
          <time className="text-[10px] tabular-nums text-[var(--color-warning)]/80">{time}</time>
        ) : null}
      </div>
    </div>
  )
}

const CONSENT_META: Record<
  ConsentVerdict,
  {
    Icon: typeof IconPhone
    label: string
    sub: string
    tone: string
    card: string
  }
> = {
  granted_perm: {
    Icon: IconShieldCheck,
    label: "Permissão de ligação concedida",
    sub: "Sem expiração · ligações permanentes",
    tone: "text-[var(--color-success)]",
    card: "border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--glass-bg-base))]",
  },
  granted_temp: {
    Icon: IconShieldCheck,
    label: "Permissão de ligação concedida",
    sub: "Válida por 7 dias",
    tone: "text-[var(--color-success)]",
    card: "border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--glass-bg-base))]",
  },
  denied: {
    Icon: IconPhoneOff,
    label: "Permissão de ligação recusada",
    sub: "A Meta bloqueia novo pedido por 24h",
    tone: "text-[var(--color-danger)]",
    card: "border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--glass-bg-base))]",
  },
  unknown: {
    Icon: IconPhone,
    label: "Resposta ao pedido de permissão",
    sub: "Cliente respondeu ao pedido de ligação",
    tone: "text-[var(--text-muted)]",
    card: "border-[var(--glass-border)] bg-[var(--glass-bg-subtle)]",
  },
}

export function ConsentEventRow({
  verdict,
  time,
  className,
}: {
  verdict: ConsentVerdict
  time?: string | null
  className?: string
}) {
  const meta = CONSENT_META[verdict] ?? CONSENT_META.unknown
  const Icon = meta.Icon
  return (
    <div
      role="status"
      data-chat-consent={verdict}
      className={cn("flex w-full justify-center py-1", className)}
    >
      <div className={cn("flex w-full max-w-[520px] items-center gap-3 rounded-2xl border px-4 py-2.5", meta.card)}>
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--glass-bg-overlay)] shadow-[var(--glass-shadow-sm)]", meta.tone)}>
          <Icon size={16} stroke={2.25} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[12px] font-bold text-[var(--text-primary)]">{meta.label}</p>
          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--text-muted)]">{meta.sub}</p>
        </div>
        {time ? (
          <time className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {time}
          </time>
        ) : null}
      </div>
    </div>
  )
}
