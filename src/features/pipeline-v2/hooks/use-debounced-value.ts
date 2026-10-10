"use client";

import { useEffect, useState } from "react";

/**
 * Valor que só muda depois de `delayMs` sem novas alterações.
 *
 * `immediate(next)` = este valor não espera (ex.: voltar ao estado vazio,
 * que não custa requisição). Para chaves de query: passe uma string/
 * primitivo estável, não um objeto novo a cada render.
 */
export function useDebouncedValue<T extends string | number | boolean | null>(
  value: T,
  delayMs: number,
  options: { immediate?: (next: T) => boolean } = {},
): T {
  const [applied, setApplied] = useState(value);
  const skipWait = value !== applied && (options.immediate?.(value) ?? false);
  // Ajuste de estado durante o render (o React refaz o render com o valor
  // novo) — sem um efeito com `setState` síncrono.
  if (skipWait) setApplied(value);

  useEffect(() => {
    if (value === applied || skipWait) return;
    const timer = setTimeout(() => setApplied(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, applied, skipWait, delayMs]);

  return skipWait ? value : applied;
}
