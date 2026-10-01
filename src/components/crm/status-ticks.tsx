"use client"

/**
 * Ticks de ack estilo WhatsApp (pending / sent / delivered / read / failed).
 * Compartilhado entre bolhas do chat e preview do card da lista.
 */
import { cn } from "@/lib/utils"
import {
  IconAlertCircleFilled,
  IconCheck,
  IconChecks,
  IconClock,
} from "@tabler/icons-react"

import type { DeliveryTickStatus } from "@/lib/delivery-status"
export type { DeliveryTickStatus } from "@/lib/delivery-status"

/** Ticks de status estilo WhatsApp.
 *  `onLightBg` = true em fundos claros (card da lista, bolha de automação). */
export function StatusTicks({
  status,
  onLightBg,
  size = "bubble",
}: {
  status: DeliveryTickStatus
  onLightBg?: boolean
  /** `card` = ícones levemente menores pro preview da lista. */
  size?: "bubble" | "card"
}) {
  const dim = onLightBg ? "text-[var(--text-muted)]" : "text-white/70"
  const solid = onLightBg ? "text-[var(--text-secondary)]" : "text-white/75"
  const clock = size === "card" ? 11 : 12
  const fail = size === "card" ? 12 : 13
  const check = size === "card" ? 12 : 14
  const checks = size === "card" ? 13 : 15

  if (status === "pending") {
    return (
      <IconClock
        size={clock}
        className={cn("shrink-0", dim)}
        aria-label="Enviando"
      />
    )
  }
  if (status === "failed") {
    // Hard #ef4444 — NÃO depender de var(--wa-tick-fail): o footer da bolha
    // seta `color` inline (cinza) e o card herda text-muted. Se a var não
    // resolve (token só em @theme), o ícone herda cinza. `color` do Tabler
    // + style + !text vencem herança em bolha azul e card claro.
    return (
      <span
        className="inline-flex shrink-0 !text-[#ef4444]"
        style={{ color: "#ef4444" }}
        aria-label="Falha no envio"
      >
        <IconAlertCircleFilled
          size={fail}
          color="#ef4444"
          className="shrink-0 !text-[#ef4444]"
          style={{ color: "#ef4444" }}
        />
      </span>
    )
  }
  if (status === "sent") {
    return (
      <IconCheck
        size={check}
        className={cn("shrink-0", solid)}
        aria-label="Enviada"
      />
    )
  }
  // `read` em fundo claro: azul fixo (mesmo padrão do failed) — evita herdar
  // text-muted do card italic e parecer "entregue" cinza.
  if (status === "read") {
    return (
      <span
        className="inline-flex shrink-0 !text-[#38bdf8]"
        style={{ color: "#38bdf8" }}
        aria-label="Lida"
      >
        <IconChecks
          size={checks}
          color="#38bdf8"
          className="shrink-0 !text-[#38bdf8]"
          style={{ color: "#38bdf8" }}
        />
      </span>
    )
  }
  return (
    <IconChecks
      size={checks}
      className={cn("shrink-0", solid)}
      aria-label="Entregue"
    />
  )
}

export { normalizeDeliveryStatus } from "@/lib/delivery-status";
