"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import {
  ROW_WINDOW_DEFAULT_HEIGHT,
  initialRowVisible,
  rememberRowHeight,
  type RowWindowRegistry,
} from "@/lib/row-window"

interface WindowedRowProps {
  /** Registro da lista (`createRowWindowRegistry`). `null` = sem janela: sempre renderiza. */
  registry: RowWindowRegistry | null
  /** Posição na lista — decide quem nasce renderizado antes da 1ª medição. */
  index: number
  /**
   * Conteúdo da linha. Como função, só é invocada quando a linha está na
   * janela — o custo de montar slots/elementos fica proporcional ao
   * que está na tela, não ao tamanho da lista.
   */
  children: ReactNode | (() => ReactNode)
  className?: string
}

type RowState = { visible: boolean; height: number | null }

/**
 * Linha de lista virtualizada (ver `lib/row-window.ts`). Wrapper sempre
 * montado (chave/ordem/`gap` do flex preservados); fora da janela vira um
 * placeholder com a última altura medida. Estado em `useState` (não em
 * ref) para o render não ler refs.
 */
export function WindowedRow({ registry, index, children, className }: WindowedRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<RowState>(() => ({
    visible: initialRowVisible(index, registry != null),
    height: null,
  }))

  useEffect(() => {
    const el = ref.current
    if (!el || !registry) return
    return registry.register(el, (visible, measured) => {
      setState((prev) => {
        if (prev.visible === visible) return prev
        return {
          visible,
          height: visible ? prev.height : rememberRowHeight(prev.height, measured),
        }
      })
    })
  }, [registry])

  const visible = registry == null || state.visible
  return (
    <div
      ref={ref}
      className={cn("shrink-0", className)}
      style={visible ? undefined : { height: state.height ?? ROW_WINDOW_DEFAULT_HEIGHT }}
      aria-hidden={visible ? undefined : true}
    >
      {visible ? (typeof children === "function" ? children() : children) : null}
    </div>
  )
}
