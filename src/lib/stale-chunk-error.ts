/** Chunk/CSS velho após deploy — o SW ou o cache do browser serviu hash antigo. */
export function isStaleChunkError(error: { name?: string; message?: string } | null | undefined) {
  if (!error) return false;
  const name = error.name ?? "";
  const message = error.message ?? "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(message) ||
    /Loading CSS chunk [\w-]+ failed/i.test(message) ||
    /Failed to fetch dynamically imported module/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

const RELOAD_KEY = "crm-stale-chunk-reload";

/** Recarrega uma vez. Evita loop se o erro persistir. */
export function reloadOnceForStaleChunk(error: { name?: string; message?: string } | null | undefined) {
  if (typeof window === "undefined" || !isStaleChunkError(error)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (last && Date.now() - last < 15_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // sessionStorage bloqueado — recarrega mesmo assim.
  }
  window.location.reload();
  return true;
}
