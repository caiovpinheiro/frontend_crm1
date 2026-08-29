"use client";

import { useEffect, useState } from "react";

/**
 * Libera queries de shell (widgets, alerts, ping) depois do primeiro
 * paint da rota. Evita competir com o fetch que pinta a tela.
 */
export function useIdleEnabled(delayMs = 2500) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      timeoutId = setTimeout(() => setReady(true), delayMs);
    };

    if (typeof requestIdleCallback === "function") {
      const idleId = requestIdleCallback(arm, { timeout: delayMs });
      return () => {
        cancelIdleCallback(idleId);
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    arm();
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [delayMs]);

  return ready;
}
