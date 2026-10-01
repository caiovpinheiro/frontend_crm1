"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Página que rendeu menos linhas que isto ganha UMA página automática. */
export const SCROLL_LOAD_MORE_MIN_NEW_ITEMS = 10;

/**
 * Entre o pedido e o `loading` chegar ao componente (o React Query avisa
 * num macrotask) a rolagem não conta nem dispara: eventos colados ao pedido
 * não viram outro pedido. Teto, caso o pedido nem comece.
 */
const FIRE_SETTLE_MS = 400;

/**
 * "Carregar mais" ao chegar no fim de uma lista rolável — UM pedido por
 * gesto de rolagem.
 *
 * Cada pedido gasta uma "permissão", que só volta quando:
 *  - o usuário ROLA de verdade uma distância mínima (padrão: uma tela)
 *    desde o último pedido — medida pela roda, toque, teclado ou arrasto
 *    da barra, nunca pelo evento `scroll` sozinho; ou
 *  - a sentinela saiu da área de disparo e voltou (a lista cresceu e o
 *    usuário rolou até o novo fim — vale no meio de um gesto longo).
 *
 * Por que não o evento `scroll` nem pausa de tempo: o navegador também
 * rola sozinho — scroll anchoring quando linhas entram acima da tela,
 * clamp quando a lista encolhe — e cliques de roda espaçados no fim da
 * lista viravam "gestos novos". As duas coisas encadeavam páginas sem o
 * usuário pedir (HAR do DEV: 15 GET num gesto).
 *
 * A lista começa com uma permissão: se a 1ª página não enche o scroller, um
 * preenchimento automático acontece. Com `itemCount`, a página que
 * acrescenta menos de `minNewItems` linhas (cards que colapsam, filtro no
 * cliente) ganha UMA página automática; depois disso, espera o usuário.
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
  /** Linhas na lista — liga a página automática quando uma página rende pouco. */
  itemCount?: number;
  minNewItems?: number;
  /** Rolagem do usuário (px) que libera o próximo pedido. Padrão: a altura do scroller. */
  gestureDistancePx?: number;
}): (el: HTMLElement | null) => void {
  const {
    scrollerRef,
    enabled,
    loading,
    onLoadMore,
    marginPx = 200,
    resetKey,
    itemCount,
    minNewItems = SCROLL_LOAD_MORE_MIN_NEW_ITEMS,
    gestureDistancePx,
  } = options;
  const [sentinel, setSentinel] = useState<HTMLElement | null>(null);

  // Valores do último render para os handlers (observer/eventos), sem
  // recriar o observer a cada render.
  const latest = useRef({ enabled, loading, onLoadMore, itemCount, gestureDistancePx });
  useEffect(() => {
    latest.current = { enabled, loading, onLoadMore, itemCount, gestureDistancePx };
  });

  const armedRef = useRef(true);
  /** A sentinela saiu da área de disparo depois do último pedido. */
  const leftSinceFireRef = useRef(false);
  /** Rolagem do usuário (px, para baixo) desde o último pedido. */
  const distanceRef = useRef(0);
  /** Último pedido: linhas na hora e se foi a página automática. */
  const pendingRef = useRef<{ count?: number; auto: boolean; started: boolean } | null>(null);
  const fireRef = useRef<((auto: boolean) => void) | null>(null);
  const firedAtRef = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (!enabled) return;
    armedRef.current = true;
    pendingRef.current = null;
  }, [enabled, resetKey]);

  // Fim de um pedido: se rendeu pouco, UMA página automática.
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending) return;
    if (loading) {
      pending.started = true;
      return;
    }
    if (!pending.started) return;
    pendingRef.current = null;
    if (pending.auto || pending.count == null || itemCount == null) return;
    if (itemCount - pending.count >= minNewItems) return;
    armedRef.current = true;
    fireRef.current?.(true);
  }, [loading, itemCount, minNewItems]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!enabled || !root || !sentinel) return;

    /** Pedido feito e o `loading` ainda não chegou. */
    const settling = () =>
      pendingRef.current?.started === false &&
      Date.now() - firedAtRef.current < FIRE_SETTLE_MS;

    const fire = (auto: boolean) => {
      const now = latest.current;
      if (!now.enabled || now.loading || !armedRef.current || settling()) return;
      armedRef.current = false;
      firedAtRef.current = Date.now();
      leftSinceFireRef.current = false;
      distanceRef.current = 0;
      pendingRef.current = { count: now.itemCount, auto, started: false };
      now.onLoadMore();
    };
    fireRef.current = fire;

    const nearEnd = () =>
      root.scrollHeight - root.scrollTop - root.clientHeight <= marginPx;

    /** O usuário pediu `px` de rolagem para baixo. */
    const userScrolled = (px: number) => {
      if (px <= 0 || latest.current.loading || settling()) return;
      distanceRef.current += px;
      const needed = latest.current.gestureDistancePx ?? Math.max(200, root.clientHeight);
      if (distanceRef.current >= needed) armedRef.current = true;
      if (nearEnd()) fire(false);
    };

    const onWheel = (e: WheelEvent) => {
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? root.clientHeight : 1;
      userScrolled((e.deltaY ?? 0) * unit);
    };
    let touchY: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y == null || touchY == null) return;
      const dy = touchY - y; // dedo sobe = conteúdo desce
      touchY = y;
      userScrolled(dy);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") userScrolled(40);
      else if (e.key === "PageDown" || e.key === " ") userScrolled(root.clientHeight);
      else if (e.key === "End") userScrolled(Number.MAX_SAFE_INTEGER);
    };
    // Arrasto da barra de rolagem: o ponteiro desce no próprio scroller.
    let dragTop: number | null = null;
    const onPointerDown = (e: PointerEvent) => {
      if (e.target === root) dragTop = root.scrollTop;
    };
    const onPointerUp = () => {
      dragTop = null;
    };
    const onScroll = () => {
      if (dragTop != null) {
        const top = root.scrollTop;
        userScrolled(top - dragTop);
        dragTop = top;
        return;
      }
      // `scroll` sozinho não libera pedido (pode ser o navegador); só
      // consome a permissão que já existe.
      if (nearEnd()) fire(false);
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
              if (leftSinceFireRef.current && !latest.current.loading) {
                armedRef.current = true;
              }
              fire(false);
            },
            { root, rootMargin: `${marginPx}px 0px` },
          );
    observer?.observe(sentinel);

    const passive = { passive: true } as const;
    root.addEventListener("scroll", onScroll, passive);
    root.addEventListener("wheel", onWheel, passive);
    root.addEventListener("touchstart", onTouchStart, passive);
    root.addEventListener("touchmove", onTouchMove, passive);
    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("pointerdown", onPointerDown, passive);
    window.addEventListener("pointerup", onPointerUp, passive);
    window.addEventListener("pointercancel", onPointerUp, passive);
    return () => {
      if (fireRef.current === fire) fireRef.current = null;
      observer?.disconnect();
      root.removeEventListener("scroll", onScroll);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
    };
  }, [scrollerRef, enabled, sentinel, marginPx]);

  return setSentinel;
}
