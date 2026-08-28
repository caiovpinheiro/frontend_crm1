"use client";

/**
 * Handle vertical fino que permite redimensionar uma coluna por arrasto
 * horizontal. Use posicionando como filho direto de um container com
 * `position: relative` — ele se ancora em `right: -3px`.
 *
 * Persistência:
 *  - Quando `storageKey` é fornecido, salva o valor em localStorage.
 *
 * Comportamento:
 *  - Pointer events (touch + mouse + pen).
 *  - Aplica cursor SVG (`.v2-col-resize-cursor`) e `user-select: none` durante o arrasto.
 *  - Respeita `min` / `max`.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// SSR-safe layout effect — no cliente roda sync antes do paint (evita
// "flash" de valor default antes de ler o localStorage).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface ColumnResizerProps {
  /** Largura atual em px (controlada pelo pai). */
  value: number;
  /** Callback chamado a cada movimento (frame-throttled pelo browser). */
  onChange: (px: number) => void;
  /** Largura mínima permitida. Default 240. */
  min?: number;
  /** Largura máxima permitida. Default 520. */
  max?: number;
  /**
   * "right" (padrão): alça ancora à direita do container — para colunas esquerdas.
   * "left": alça ancora à esquerda e inverte o delta — para colunas direitas.
   */
  direction?: "right" | "left";
  className?: string;
}

export function ColumnResizer({
  value,
  onChange,
  min = 240,
  max = 520,
  direction = "right",
  className,
}: ColumnResizerProps) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startValueRef = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      startXRef.current = e.clientX;
      startValueRef.current = value;
      setDragging(true);
    },
    [value],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const raw = e.clientX - startXRef.current;
      // Para coluna direita: arrastar para a ESQUERDA (delta negativo) aumenta a largura.
      const delta = direction === "left" ? -raw : raw;
      const next = Math.min(max, Math.max(min, startValueRef.current + delta));
      onChange(next);
    };
    const onUp = () => setDragging(false);
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
    const prevSelect = document.body.style.userSelect;
    document.body.classList.add("v2-col-resize-cursor");
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("v2-col-resize-cursor");
      document.body.style.userSelect = prevSelect;
    };
  }, [dragging, direction, min, max, onChange]);

  return (
    <button
      type="button"
      aria-label="Redimensionar coluna"
      title="Arrastar para tornar mais estreito ou mais largo"
      onPointerDown={onPointerDown}
      className={cn(
        "v2-col-resize-cursor group/resize absolute top-0 z-20 flex h-full w-3 appearance-none items-center justify-center border-0 bg-transparent p-0",
        direction === "left" ? "-left-[6px]" : "-right-[6px]",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "pointer-events-none rounded-full transition-colors",
          dragging
            ? "h-8 w-[3px] bg-primary"
            : "h-4 w-px bg-transparent group-hover/resize:bg-primary",
        )}
      />
    </button>
  );
}

/**
 * Hook que mantém a largura em state + persiste em localStorage.
 * Retorna [value, setValue] com leitura SSR-safe (default no primeiro
 * render, lê do storage no useEffect — evita hidratação inconsistente).
 */
export function usePersistentWidth(
  storageKey: string,
  defaultValue: number,
): [number, (v: number) => void] {
  const [v, setV] = useState(defaultValue);

  useIsoLayoutEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n) && n > 0) setV(n);
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const setAndSave = useCallback(
    (next: number) => {
      setV(next);
      try {
        window.localStorage.setItem(storageKey, String(Math.round(next)));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  return [v, setAndSave];
}

/** Extrai px de classes Tailwind `w-[150px]`. */
export function parseWidthClass(width: string, fallback = 140): number {
  const m = width.match(/w-\[(\d+)px\]/);
  return m ? Number(m[1]) : fallback;
}

/**
 * Larguras de várias colunas de lista, persistidas em localStorage.
 * Keys estáveis (ex.: "phone", "__name__").
 */
export function useColumnWidths(
  storageKey: string,
  defaults: Record<string, number>,
): {
  widths: Record<string, number>;
  getWidth: (key: string, fallback?: number) => number;
  setWidth: (key: string, px: number) => void;
} {
  const [widths, setWidths] = useState<Record<string, number>>(defaults);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object") return;
      const next: Record<string, number> = { ...defaults };
      for (const [k, v] of Object.entries(parsed)) {
        const n = typeof v === "number" ? v : Number(v);
        if (Number.isFinite(n) && n > 0) next[k] = Math.round(n);
      }
      setWidths(next);
    } catch {
      /* ignore */
    }
    // defaults é tratado como constante estável pelo caller
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const setWidth = useCallback(
    (key: string, px: number) => {
      setWidths((prev) => {
        const next = { ...prev, [key]: Math.round(px) };
        try {
          window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [storageKey],
  );

  const getWidth = useCallback(
    (key: string, fallback = 140) => widths[key] ?? defaults[key] ?? fallback,
    [widths, defaults],
  );

  return { widths, getWidth, setWidth };
}

/** Célula de cabeçalho com alça de resize (filho deve ser o rótulo). */
export function ResizableColumnHead({
  width,
  onResize,
  min = 72,
  max = 480,
  className,
  children,
}: {
  width: number;
  onResize: (px: number) => void;
  min?: number;
  max?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn("relative min-w-0 shrink-0 overflow-x-hidden overflow-y-visible pr-1", className)}
      style={{ width, minWidth: width, maxWidth: width }}
    >
      {children}
      <ColumnResizer value={width} onChange={onResize} min={min} max={max} />
    </div>
  );
}
