"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  acquirePresenceTicker,
  recordPresenceActivity,
} from "@/hooks/presence-ticker";
import {
  INTERACTIVE_SELECTOR,
  isEditableTag,
  isTrackableKey,
} from "./activity-target";

/**
 * Rastreador global de USO REAL.
 *
 * Conta apenas interações reais em aba visível:
 *   - pointerdown em controle interativo (via closest do INTERACTIVE_SELECTOR);
 *   - keydown em campo editável com tecla que altera conteúdo;
 *   - change/submit em qualquer parte da árvore;
 *   - mudança de rota (usePathname).
 *
 * A contagem vai para o tique de presença (`hooks/presence-ticker.ts`): a
 * aba líder do navegador manda `POST /api/agents/me/activity` com
 * `{ interactionCount }` agregado de todas as abas, junto do ping, no
 * máximo um por janela de 90 s (a 1ª interação depois de 5 min parado
 * antecipa o envio para abrir a sessão). Troca de rota só conta — não é
 * mais um POST próprio. Falha silenciosa; sem retry automático.
 */
export function useSystemActivity(enabled = true) {
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const release = acquirePresenceTicker();

    // Só com a aba visível (o tique também confere).
    function record() {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      recordPresenceActivity(1);
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
      // O tique descarrega o que ainda não saiu ao ser desligado.
      release();
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
    // Conta como interação; vai no próximo tique (antes: 1 POST por rota).
    recordPresenceActivity(1);
  }, [pathname, enabled]);
}
