/**
 * Memoização por identidade da chave (WeakMap) com balde de tempo.
 *
 * Uso: adapters que derivam view-models de DTOs do React Query. O
 * structural sharing e os patches SSE preservam a referência dos DTOs
 * que não mudaram; devolver o MESMO objeto derivado para o mesmo DTO é o
 * que permite a um `React.memo` pular o render das linhas intocadas.
 *
 * O balde (`bucketMs`, 1 min por padrão) existe para derivados que
 * dependem do relógio (rótulos relativos como "5min"): dentro do mesmo
 * minuto o valor é reaproveitado; ao virar o minuto, é recalculado.
 */
export interface MemoByRefOptions {
  /** Largura do balde de tempo (ms). Default: 60 000 (minuto). */
  bucketMs?: number;
  /** Relógio injetável (testes). Default: `Date.now`. */
  now?: () => number;
}

export function memoByRef<K extends object, V>(
  build: (key: K) => V,
  options: MemoByRefOptions = {},
): (key: K) => V {
  const bucketMs = options.bucketMs ?? 60_000;
  const now = options.now ?? Date.now;
  const cache = new WeakMap<K, { bucket: number; value: V }>();
  return (key: K): V => {
    const bucket = Math.floor(now() / bucketMs);
    const hit = cache.get(key);
    if (hit && hit.bucket === bucket) return hit.value;
    const value = build(key);
    cache.set(key, { bucket, value });
    return value;
  };
}
