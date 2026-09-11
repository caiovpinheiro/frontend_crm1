"use client";

import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  document.addEventListener("visibilitychange", onChange);
  return () => document.removeEventListener("visibilitychange", onChange);
}

function getSnapshot() {
  return document.visibilityState === "visible";
}

/** SSR e 1º hydrate assumem aba visível (evita mismatch). */
function getServerSnapshot() {
  return true;
}

/** `false` quando a aba do browser está em segundo plano. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
