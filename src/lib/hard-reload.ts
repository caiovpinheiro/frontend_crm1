/**
 * Hard reload do app no browser: unregister SW + apaga Cache Storage +
 * location.reload(). É o máximo que o JS consegue se aproximar de
 * Ctrl+Shift+R — falhas na limpeza nunca bloqueiam o reload.
 */
export async function clearWebCachesAndReload(): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((reg) => reg.unregister()));
      } catch {
        // ignore — reload segue no finally
      }
    }
    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      } catch {
        // ignore — reload segue no finally
      }
    }
  } finally {
    window.location.reload();
  }
}

/** Fingerprint do build servido agora — rota dinâmica, fora do precache do SW. */
export async function fetchAppRevision(): Promise<string | null> {
  try {
    const res = await fetch(`/api/app-revision?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) return null;
    const data = (await res.json()) as { revision?: unknown };
    if (typeof data.revision !== "string") return null;
    const revision = data.revision.trim();
    return revision || null;
  } catch {
    return null;
  }
}
