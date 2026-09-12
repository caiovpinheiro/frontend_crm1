/** Cache se a org tem Telefonia (`calls_history`). Evita GET /widgets
 *  em toda rota depois da primeira resposta na sessão/dispositivo. */

export const CALLS_WIDGET_SLUG = "calls_history";
export const CALLS_WIDGET_CACHE_KEY = "crm:calls-widget-installed";

export function readCachedCallsInstalled(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CALLS_WIDGET_CACHE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* localStorage indisponível */
  }
  return null;
}

export function writeCachedCallsInstalled(installed: boolean) {
  try {
    window.localStorage.setItem(CALLS_WIDGET_CACHE_KEY, installed ? "1" : "0");
  } catch {
    /* localStorage indisponível */
  }
}
