/**
 * Sessão revogada no servidor (troca de senha, "sair de todos os
 * dispositivos", erase): o backend responde 401 com
 * `code: "SESSION_REVOKED"` — inclusive para a sessão que fez o pedido.
 * O cookie do frontend continua "válido" para o middleware, então sem
 * tratamento a pessoa fica numa tela em que tudo falha. Aqui: signOut +
 * volta ao login, UMA vez.
 *
 * Sem loop: uma tentativa por carga de página e no máximo uma a cada 60s
 * entre recargas (`sessionStorage`); nas páginas de autenticação não faz
 * nada. Se o signOut falhar, não insiste — os erros 401 seguem aparecendo
 * normalmente ("Sua sessão expirou…").
 *
 * Exceção: quando é o próprio usuário que revoga (troca de senha, "sair dos
 * outros dispositivos"), esta sessão se renova com a prova que o backend
 * devolve (`session-renewal.ts`). Enquanto essa renovação está em andamento
 * — nesta aba ou em outra do navegador — um 401 revogado é esperado e NÃO
 * desloga: o signOut apagaria o cookie que está sendo renovado.
 *
 * Sem import estático de `next-auth/react`: este módulo é importado por
 * `lib/api.ts`, que também roda no servidor.
 */

import { isSessionRenewalInProgress } from "@/lib/session-renewal";

export const SESSION_REVOKED_CODE = "SESSION_REVOKED";

const GUARD_KEY = "crm:session-revoked-at";
export const SESSION_REVOKED_GUARD_MS = 60_000;

const AUTH_PATH_RE =
  /^\/(login|register|forgot-password|reset-password|verify-email|accept-invite)(\/|$)/;

let handled = false;

export function isSessionRevoked(status: number, code?: string | null): boolean {
  return status === 401 && code === SESSION_REVOKED_CODE;
}

/** Só para testes. */
export function __resetSessionRevokedForTests(): void {
  handled = false;
}

async function defaultSignOut(): Promise<unknown> {
  const mod = await import("@/lib/sign-out-to-login");
  return mod.signOutToLogin();
}

/**
 * Dispara o signOut + redirect uma única vez. Devolve `true` quando
 * disparou (para testes/telemetria).
 */
export function handleSessionRevoked(
  signOut: () => Promise<unknown> = defaultSignOut,
): boolean {
  if (typeof window === "undefined") return false;
  if (handled) return false;
  if (AUTH_PATH_RE.test(window.location.pathname)) return false;
  // Renovação em andamento: não marca `handled` — se ela falhar, o próximo
  // 401 revogado desloga normalmente.
  if (isSessionRenewalInProgress()) return false;

  const now = Date.now();
  try {
    const last = Number(window.sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (last > 0 && now - last < SESSION_REVOKED_GUARD_MS) return false;
    window.sessionStorage.setItem(GUARD_KEY, String(now));
  } catch {
    /* storage indisponível: vale o guard em memória */
  }

  handled = true;
  void signOut().catch(() => {
    /* não insiste: `handled` segue true nesta página */
  });
  return true;
}
