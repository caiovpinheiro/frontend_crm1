"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  acquirePresenceTicker,
  recordPresenceActivity,
} from "@/hooks/presence-ticker";
import { noteHumanInteraction } from "@/lib/session-idle";

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
 *   - mudança de rota (usePathname);
 *   - rolagem pelo usuário (`wheel`/`touchmove`; no máximo 1 a cada 5 s);
 *   - a aba voltar ao primeiro plano / ganhar foco (no máximo 1 a cada 5 s).
 *
 * A mesma definição alimenta a última interação do navegador
 * (`lib/session-idle.ts`, logout por ociosidade): cada interação passa
 * primeiro por `noteHumanInteraction`, que CONFERE o limite antes de
 * registrar — quem volta ao foco depois do limite sai, e essa volta não
 * conta. Ping, SSE, refetch, polling e timers não passam por aqui.
 *
 * A contagem vai para o tique de presença (`hooks/presence-ticker.ts`): a
 * aba líder do navegador manda `POST /api/agents/me/activity` com
 * `{ interactionCount }` agregado de todas as abas, junto do ping, no
 * máximo um por janela de 90 s (a 1ª interação depois de 5 min parado
 * antecipa o envio para abrir a sessão). Troca de rota só conta — não é
 * mais um POST próprio. Falha silenciosa; sem retry automático.
 *
 * Janela sem nenhuma destas interações não manda activity algum (nem com
 * 0 pulsos). Movimento do mouse e hover não contam; rolagem programática
 * (ex.: chat descendo sozinho com mensagem nova) também não — só `wheel` e
 * `touchmove`. O painel de uso do sistema só depende destes pulsos
 * agregados (sessão de uso fecha 5 min após o último): com rolagem e foco
 * contando, quem só lê/rola ou volta à aba passa a ter a sessão de uso
 * aberta/estendida, e "Interações" sobe (no máximo +1 por 5 s de rolagem
 * e +1 por volta à aba).
 */

/** Rolagem e foco: no máximo uma interação por janela. */
export const PASSIVE_INTERACTION_THROTTLE_MS = 5_000;
export function useSystemActivity(enabled = true) {
  const pathname = usePathname();
  const pathnameRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    const release = acquirePresenceTicker();

    // Só com a aba visível (o tique também confere). Antes de contar,
    // confere a ociosidade: parado além do limite → logout, não conta.
    function record() {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;
      if (!noteHumanInteraction()) return;
      recordPresenceActivity(1);
    }

    let lastScrollAt = Number.NEGATIVE_INFINITY;
    let lastFocusAt = Number.NEGATIVE_INFINITY;

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

    // Rolagem do usuário (roda do mouse/trackpad, dedo). `scroll` não:
    // dispara também em rolagem programática.
    function onScrollInput() {
      const now = Date.now();
      if (now - lastScrollAt < PASSIVE_INTERACTION_THROTTLE_MS) return;
      lastScrollAt = now;
      record();
    }

    // Volta ao primeiro plano: `focus` e `visibilitychange` chegam juntos.
    function onFocusBack() {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastFocusAt < PASSIVE_INTERACTION_THROTTLE_MS) return;
      lastFocusAt = now;
      record();
    }

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    document.addEventListener("keydown", onKeyDown, { passive: true });
    document.addEventListener("change", onChange, true);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("wheel", onScrollInput, { passive: true, capture: true });
    document.addEventListener("touchmove", onScrollInput, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onFocusBack);
    window.addEventListener("focus", onFocusBack);

    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("submit", onSubmit, true);
      document.removeEventListener("wheel", onScrollInput, true);
      document.removeEventListener("touchmove", onScrollInput, true);
      document.removeEventListener("visibilitychange", onFocusBack);
      window.removeEventListener("focus", onFocusBack);
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
    if (!noteHumanInteraction()) return;
    recordPresenceActivity(1);
  }, [pathname, enabled]);
}
