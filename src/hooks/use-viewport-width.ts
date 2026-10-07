"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

const getSnapshot = () => window.innerWidth;
/** Desktop típico: o SSR/hidratação aposta em desktop (ver `useIsDesktop`). */
const getServerSnapshot = () => 1280;

/** Largura da janela em px, reativa ao resize. */
export function useViewportWidth(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** NavRail recolhida / expandida (`--nav-rail-w`, publicado pelo `NavRailV2`). */
export const NAV_RAIL_COLLAPSED_PX = 72;
export const NAV_RAIL_EXPANDED_PX = 220;

function subscribeNavRail(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-nav-expanded"],
  });
  return () => observer.disconnect();
}

const getNavRailSnapshot = () =>
  document.documentElement.dataset.navExpanded === "true"
    ? NAV_RAIL_EXPANDED_PX
    : NAV_RAIL_COLLAPSED_PX;

/** Largura atual da NavRail em px (a preferência do usuário muda a área útil). */
export function useNavRailWidth(): number {
  return useSyncExternalStore(
    subscribeNavRail,
    getNavRailSnapshot,
    () => NAV_RAIL_COLLAPSED_PX,
  );
}
