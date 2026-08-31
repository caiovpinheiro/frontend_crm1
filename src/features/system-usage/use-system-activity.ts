"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import { apiUrl } from "@/lib/api";
import {
  INTERACTIVE_SELECTOR,
  isEditableTag,
  isTrackableKey,
} from "./activity-target";

/**
 * Janela de agregação: envia no máximo um pulso a cada 90s.
 * O primeiro pulso vai imediatamente para abrir a sessão no backend.
 */
const AGGREGATE_WINDOW_MS = 90_000;

/**
 * Rastreador global de USO REAL.
 *
 * Conta apenas interações reais em aba visível:
 *   - pointerdown em controle interativo (via closest do INTERACTIVE_SELECTOR);
 *   - keydown em campo editável com tecla que altera conteúdo;
 *   - change/submit em qualquer parte da árvore;
 *   - mudança de rota (usePathname).
 *
 * Envia pulsos agregados via POST /api/agents/me/activity com
 * `{ interactionCount }`. Falha silenciosa; sem retry automático.
 */
export function useSystemActivity(enabled = true) {
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);
  const bufferRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    // ── Envio ────────────────────────────────────────────────────────
    function flush() {
      const count = bufferRef.current;
      bufferRef.current = 0;
      timerRef.current = null;
      if (count <= 0) return;
      try {
        void fetch(apiUrl("/api/agents/me/activity"), {
          method: "POST",
          keepalive: true,
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interactionCount: count }),
        }).catch(() => {
          /* silencioso — próximo pulso reajusta */
        });
      } catch {
        /* silencioso */
      }
    }

    function scheduleFlush() {
      if (timerRef.current) return;
      timerRef.current = setTimeout(flush, AGGREGATE_WINDOW_MS);
    }

    /**
     * Registra uma interação. Se é a primeira do ciclo, dispara flush
     * imediato para abrir a sessão no backend. As demais aguardam o
     * término da janela de 90s.
     */
    function record() {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      const first = bufferRef.current === 0 && timerRef.current === null;
      bufferRef.current += 1;

      if (first) {
        // Envia imediatamente e abre janela para acumular as próximas.
        // Coloca 1 no buffer via increment já feito → flush envia 1.
        flush();
        // Reinicia janela para acumular novas ações dos próximos 90s.
        timerRef.current = setTimeout(flush, AGGREGATE_WINDOW_MS);
      } else {
        scheduleFlush();
      }
    }

    // ── Listeners ────────────────────────────────────────────────────
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target || typeof target.closest !== "function") return;
      const hit = target.closest(INTERACTIVE_SELECTOR);
      if (!hit) return;
      record();
    }

    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tagName = target.tagName ?? "";
      const editable =
        isEditableTag(tagName) ||
        (target as HTMLElement).isContentEditable === true;
      if (!editable) return;
      if (!isTrackableKey(e)) return;
      record();
    }

    function onChange(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const tagName = target.tagName ?? "";
      if (
        !isEditableTag(tagName) &&
        (target as HTMLElement).isContentEditable !== true
      ) {
        return;
      }
      record();
    }

    function onSubmit() {
      record();
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown, { passive: true });
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // Descarga oportuna de contador remanescente ao desmontar.
      const remaining = bufferRef.current;
      bufferRef.current = 0;
      if (remaining > 0) {
        try {
          void fetch(apiUrl("/api/agents/me/activity"), {
            method: "POST",
            keepalive: true,
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ interactionCount: remaining }),
          }).catch(() => {
            /* silencioso */
          });
        } catch {
          /* silencioso */
        }
      }
    };
  }, [enabled]);

  // ── Mudança de rota (navegação) ────────────────────────────────────
  useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;

    const prev = pathnameRef.current;
    pathnameRef.current = pathname;
    if (prev === null) return; // primeira montagem: já contamos como abertura na primeira ação real
    if (prev === pathname) return;

    // Reaproveita o mesmo caminho de gravação através de um custom event
    // para não duplicar código — mas mais simples: chama diretamente o
    // endpoint via um contador manual sem depender do closure do useEffect
    // acima. Como o buffer/timer são refs, poderíamos referenciar aqui,
    // mas isolar o envio é mais claro:
    try {
      void fetch(apiUrl("/api/agents/me/activity"), {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionCount: 1 }),
      }).catch(() => {
        /* silencioso */
      });
    } catch {
      /* silencioso */
    }
  }, [pathname, enabled]);
}
