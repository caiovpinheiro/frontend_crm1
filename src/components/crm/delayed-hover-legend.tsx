"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { tooltipMotionClass, tooltipSurfaceClass } from "@/components/crm/tooltip-glass"

const DEFAULT_DELAY_MS = 1500
const OFFSET_Y = 18

/**
 * Legenda do texto completo após hover longo (padrão 1,5s), abaixo do
 * cursor. Só aparece quando o conteúdo medido está truncado
 * (`scrollWidth > clientWidth`) — campos estreitos / opções do select.
 */
export function DelayedHoverLegend({
  text,
  delayMs = DEFAULT_DELAY_MS,
  children,
  className,
  disabled,
}: {
  text: string
  delayMs?: number
  children: React.ReactNode
  className?: string
  /** Força desligar (ex.: opção já com wrap). */
  disabled?: boolean
}) {
  const wrapRef = React.useRef<HTMLSpanElement>(null)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPointerRef = React.useRef({ x: 0, y: 0 })
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null)

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const hide = React.useCallback(() => {
    clearTimer()
    setPos(null)
  }, [clearTimer])

  React.useEffect(() => () => clearTimer(), [clearTimer])

  if (!text.trim() || disabled) {
    return <>{children}</>
  }

  const isTruncated = () => {
    const root = wrapRef.current
    if (!root) return false
    const candidates: HTMLElement[] = [
      ...(Array.from(root.querySelectorAll("[data-legend-measure]")) as HTMLElement[]),
      root,
    ]
    // Elemento inline devolve clientWidth 0 — ignora e tenta o próximo.
    return candidates.some(
      (el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1,
    )
  }

  const onPointerEnter = (e: React.PointerEvent) => {
    hide()
    if (!isTruncated()) return
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    timerRef.current = setTimeout(() => {
      const { x, y } = lastPointerRef.current
      setPos({ x, y: y + OFFSET_Y })
    }, delayMs)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    lastPointerRef.current = { x: e.clientX, y: e.clientY }
    if (!pos) return
    setPos({ x: e.clientX, y: e.clientY + OFFSET_Y })
  }

  return (
    <span
      ref={wrapRef}
      className={cn("min-w-0 max-w-full", className)}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={hide}
    >
      {children}
      {pos && typeof document !== "undefined"
        ? createPortal(
            <span
              role="tooltip"
              className={cn(
                "pointer-events-none fixed z-[100]",
                "max-w-[min(320px,calc(100vw-1.5rem))]",
                tooltipSurfaceClass,
                tooltipMotionClass,
              )}
              style={{
                left: Math.min(pos.x, window.innerWidth - 24),
                top: Math.min(pos.y, window.innerHeight - 24),
                transform: "translateX(-50%)",
              }}
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  )
}
