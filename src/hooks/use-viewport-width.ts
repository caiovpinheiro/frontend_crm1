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
