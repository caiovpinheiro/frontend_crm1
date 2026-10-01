"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/**
 * Eventos de rolagem do mesmo gesto chegam colados (roda do mouse, inércia
 * do trackpad, arrasto da barra). Uma pausa maior que isto começa um gesto
 * novo.
 */
export const SCROLL_GESTURE_IDLE_MS = 150;

/**
 * "Carregar mais" ao chegar no fim de uma lista rolável — UM pedido por
 * gesto de rolagem.
 *
 * O padrão anterior (recriar o IntersectionObserver a cada página e pedir a
 * seguinte se a sentinela ainda estivesse visível) vira rajada sempre que a
 * página nova não empurra a sentinela para fora da área de disparo: página
 * pequena, cards que não entram na lista (dedupe/filtro no cliente), seção
 * recolhida. Aqui cada pedido gasta uma "permissão", que só volta quando:
 *  - o usuário começa um gesto novo (scroll/roda/toque depois de uma pausa); ou
 *  - a sentinela saiu da área de disparo e voltou (a lista cresceu e o
 *    usuário rolou até o novo fim — vale no meio de um gesto longo).
 *
 * A lista começa com uma permissão: se a 1ª página não enche o scroller, um
 * preenchimento automático acontece; depois disso, só com gesto.
 *
 * Devolve o ref (callback) da sentinela, que fica no fim da lista.
 */
export function useScrollLoadMore(options: {
  /** Elemento com `overflow-y: auto` que contém a lista. */
  scrollerRef: RefObject<HTMLElement | null>;
  /** Há mais itens para pedir. */
  enabled: boolean;
  /** Pedido em voo: nada dispara enquanto for `true`. */
  loading: boolean;
  onLoadMore: () => void;
  /** Distância do fim (px) em que o pedido já sai. */
  marginPx?: number;
  /** Mudou a lista (aba, etapa, filtro): vale um preenchimento de novo. */
  resetKey?: unknown;
}): (el: HTMLElement | null) => void {
  const { scrollerRef, enabled, loading, onLoadMore, marginPx = 200, resetKey } = options;
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  // Valores do último render para os handlers (observer/eventos), sem
  // recriar o observer a cada render.
  const latest = useRef({ enabled, loading, onLoadMore });
  useEffect(() => {
    latest.current = { enabled, loading, onLoadMore };
  });

  const armedRef = useRef(true);
  /** A sentinela saiu da área de disparo depois do último pedido. */
  const leftSinceFireRef = useRef(false);
  const lastGestureAtRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (enabled) armedRef.current = true;
  }, [enabled, resetKey]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!enabled || !root || !sentinel) return;

    const fire = () => {
      const now = latest.current;
      if (!now.enabled || now.loading || !armedRef.current) return;
      armedRef.current = false;
      leftSinceFireRef.current = false;
      now.onLoadMore();
    };

    const nearEnd = () =>
      root.scrollHeight - root.scrollTop - root.clientHeight <= marginPx;

    const onGesture = () => {
      const now = Date.now();
      const isNewGesture = now - lastGestureAtRef.current > SCROLL_GESTURE_IDLE_MS;
      lastGestureAtRef.current = now;
      // Gesto que começou com um pedido em voo não vale outro pedido quando
      // a resposta chegar: o usuário ainda não viu o que veio.
      if (isNewGesture && !latest.current.loading) armedRef.current = true;
      if (nearEnd()) fire();
    };

    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver(
            (entries) => {
              const entry = entries[entries.length - 1];
              if (!entry) return;
              if (!entry.isIntersecting) {
                leftSinceFireRef.current = true;
                return;
              }
              // Saiu e voltou depois do último pedido: a lista cresceu e o
              // usuário chegou ao novo fim.
              if (leftSinceFireRef.current) armedRef.current = true;
              fire();
            },
            { root, rootMargin: `${marginPx}px 0px` },
          );
    observer?.observe(sentinel);

    const passive = { passive: true } as const;
    root.addEventListener("scroll", onGesture, passive);
    root.addEventListener("wheel", onGesture, passive);
    root.addEventListener("touchmove", onGesture, passive);
    return () => {
      observer?.disconnect();
      root.removeEventListener("scroll", onGesture);
      root.removeEventListener("wheel", onGesture);
      root.removeEventListener("touchmove", onGesture);
    };
  }, [scrollerRef, enabled, sentinel, marginPx]);

  return setSentinel;
}
