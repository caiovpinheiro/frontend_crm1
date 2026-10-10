"use client";

import { useCallback, useLayoutEffect, useRef } from "react";

/**
 * Callback com identidade estável que sempre chama a versão mais recente
 * de `fn`. Para handlers passados a filhos `memo` (linhas de lista, bolhas)
 * que leem estado da página: com `useCallback` + deps a identidade mudaria
 * a cada troca desse estado e o memo de todas as linhas cairia.
 *
 * Não chamar durante o render (a versão nova só vale depois do commit).
 */
export function useStableCallback<A extends unknown[], R>(
  fn: (...args: A) => R,
): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}
