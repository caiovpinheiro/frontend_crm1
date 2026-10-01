/**
 * Logger mínimo do frontend — único ponto que fala com `console.*`.
 *
 * - `debug` / `info`: diagnóstico. Só emitem em desenvolvimento ou quando
 *   `localStorage["bwipo:debug"] = "1"` (liga em produção sem novo deploy;
 *   vale a partir da próxima chamada, sem recarregar).
 * - `warn` / `error`: sempre emitem.
 *
 * Uso: `logger.warn("escopo", "mensagem", contexto?)` → `[escopo] mensagem`.
 *
 * Dados pessoais: NÃO passe telefone, e-mail, CPF, conteúdo de mensagem,
 * tokens nem payloads inteiros de API/SSE no contexto — reduza a ids,
 * códigos e status. O logger não sanitiza nada.
 *
 * Roda em browser, Node (route handlers) e Edge (middleware): sem
 * dependências e sem tocar em `window` fora de guarda.
 */

export const LOGGER_DEBUG_STORAGE_KEY = "bwipo:debug";

type LogLevel = "debug" | "info" | "warn" | "error";

function debugEnabled(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(LOGGER_DEBUG_STORAGE_KEY) === "1";
  } catch {
    // Storage bloqueado (modo privado, iframe sandbox): sem debug.
    return false;
  }
}

function emit(level: LogLevel, scope: string, message: string, context?: unknown): void {
  if ((level === "debug" || level === "info") && !debugEnabled()) return;
  const line = `[${scope}] ${message}`;
  /* eslint-disable no-console -- o logger é o único emissor legítimo de console.* em src/ */
  if (context === undefined) console[level](line);
  else console[level](line, context);
  /* eslint-enable no-console */
}

export const logger = {
  debug: (scope: string, message: string, context?: unknown) =>
    emit("debug", scope, message, context),
  info: (scope: string, message: string, context?: unknown) =>
    emit("info", scope, message, context),
  warn: (scope: string, message: string, context?: unknown) =>
    emit("warn", scope, message, context),
  error: (scope: string, message: string, context?: unknown) =>
    emit("error", scope, message, context),
};

/**
 * Reduz uma URL a `origin + pathname` para log: query string e hash podem
 * carregar token, e-mail ou telefone.
 */
export function urlForLog(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "(url inválida)";
  }
}
