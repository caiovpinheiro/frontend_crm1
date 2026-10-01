import { useEffect, useState } from "react"
import type { Message } from "./types"

/** Sem `delivered`/`read` por mais que isto: aviso "entrega não confirmada". */
export const STALE_DELIVERY_MS = 5 * 60_000

/**
 * Mensagem ficou em `sent`/`pending` sem virar `delivered` por > 5 min.
 * Pode ser número pausado, quality rating rebaixado ou mensagem engolida
 * pela Cloud API — não é falha definitiva (o sweeper marca `failed`
 * depois), só um aviso proativo pro operador.
 */
export function isDeliveryStale(
  status: Message["status"],
  createdAt: string | undefined,
  now: number = Date.now(),
): boolean {
  if (status !== "sent" && status !== "pending") return false
  if (!createdAt) return false
  const ts = Date.parse(createdAt)
  if (!Number.isFinite(ts)) return false
  return now - ts > STALE_DELIVERY_MS
}

/**
 * Reavalia sozinho quando o limite de 5 min é cruzado com a bolha na tela:
 * agenda um re-render para esse instante (setState só no timer, nunca no
 * corpo do effect).
 */
export function useDeliveryStale(status: Message["status"], createdAt: string | undefined): boolean {
  const [, bump] = useState(0)
  useEffect(() => {
    if ((status !== "sent" && status !== "pending") || !createdAt) return
    const ts = Date.parse(createdAt)
    if (!Number.isFinite(ts)) return
    const remaining = ts + STALE_DELIVERY_MS - Date.now() + 250
    if (remaining <= 0) return
    const timer = setTimeout(() => bump((n) => n + 1), remaining)
    return () => clearTimeout(timer)
  }, [status, createdAt])
  return isDeliveryStale(status, createdAt)
}
