"use client";

import { useEffect, useRef, useState } from "react";

const DISMISS_MS = 5000;

/**
 * Aviso de desfazer troca de fila no Kanban.
 * Some em 5s. Com o ponteiro do mouse em cima, o prazo não corre;
 * ao sair, os 5s começam de novo.
 */
export function StageUndoToast({
  title,
  stageName,
  onUndo,
  onDismiss,
}: {
  title: string;
  stageName: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const timerRef = useRef<number | null>(null);
  const [cycle, setCycle] = useState(0);
  const [holding, setHolding] = useState(false);

  function clearTimer() {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function arm() {
    clearTimer();
    timerRef.current = window.setTimeout(() => onDismissRef.current(), DISMISS_MS);
  }

  useEffect(() => {
    arm();
    return clearTimer;
    // O prazo reinicia só no mouseleave (cycle), não a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycle]);

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        clearTimer();
        setHolding(true);
      }}
      onPointerLeave={(event) => {
        if (event.pointerType !== "mouse") return;
        setHolding(false);
        setCycle((n) => n + 1);
      }}
      className="pointer-events-auto fixed right-4 top-4 z-[80] w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
    >
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Fila alterada</p>
          <p className="truncate text-sm text-muted-foreground">
            {title} foi para {stageName}
          </p>
        </div>
        <button
          type="button"
          onClick={onUndo}
          className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
        >
          Desfazer
        </button>
      </div>
      <div className="h-0.5 bg-border">
        {holding ? (
          <div className="h-full w-full bg-primary" />
        ) : (
          <div
            key={cycle}
            className="h-full w-full origin-left bg-primary"
            style={{ animation: "stage-undo-shrink 5s linear forwards" }}
          />
        )}
      </div>
      <style>{`@keyframes stage-undo-shrink{from{transform:scaleX(1)}to{transform:scaleX(0)}}`}</style>
    </div>
  );
}
