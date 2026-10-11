/**
 * Sessão encerrada no servidor (troca de senha, "sair de todos os
 * dispositivos", revogação pelo admin, erase): o backend responde 401 com
 * `code: "SESSION_REVOKED"` — inclusive para a sessão que fez o pedido.
 * O cookie do frontend continua "válido" para o middleware, então sem
 * tratamento a pessoa fica numa tela em que tudo falha. Aqui: signOut +
 * volta ao login, UMA vez.
 *
 * Dois caminhos chegam aqui:
 *  - `handleSessionRevoked`: o cliente de API (`lib/api.ts`), só com o
 *    `code: "SESSION_REVOKED"` (um 401 avulso de uma tela não desloga);
 *  - `handleUnauthorized`: os laços em segundo plano — ping/activity de
 *    presença (`hooks/presence-ticker.ts`) e o SSE (`hooks/use-sse.ts`).
 *    Esses tratam QUALQUER 401 como fim da sessão: o backend antigo
 *    responde 401 sem `code` (reason `no_session`) para um token revogado,
 *    e sem isso as abas abertas pingavam para sempre.
 *
 * Um logout só, mesmo com várias abas e requests ao mesmo tempo:
 *  - nesta aba, `handled` em memória;
 *  - entre abas e entre recargas, `localStorage["crm:session-revoked-at"]`:
 *    quem grava primeiro faz o signOut; as outras abas recebem o evento
 *    `storage`, param os laços e vão para o login sem chamar o signOut de
 *    novo (`watchSessionEndInOtherTabs`). Novo signOut só depois de 60 s.
 *
 * Nas páginas de autenticação (login, cadastro, recuperar/redefinir
 * senha, verificar e-mail, convite, onboarding) não faz nada. Se o
 * signOut falhar, não insiste — os erros 401 seguem aparecendo
 * normalmente ("Sua sessão expirou…").
 *
 * Exceção: quando é o próprio usuário que revoga (troca de senha, "sair dos
 * outros dispositivos"), esta sessão se renova com a prova que o backend
 * devolve (`session-renewal.ts`). Enquanto essa renovação está em andamento
 * — nesta aba ou em outra do navegador — um 401 é esperado e NÃO desloga
 * (nem para os laços): o signOut apagaria o cookie que está sendo renovado.
 *
 * Sem import estático de `next-auth/react`: este módulo é importado por
 * `lib/api.ts`, que também roda no servidor.
 */

import { isSessionRenewalInProgress } from "@/lib/session-renewal";

export const SESSION_REVOKED_CODE = "SESSION_REVOKED";

/** Instante do último logout automático deste navegador (todas as abas). */
export const SESSION_REVOKED_STORAGE_KEY = "crm:session-revoked-at";
export const SESSION_REVOKED_GUARD_MS = 60_000;
/** Outra aba deslogou: tempo para o signOut dela apagar o cookie antes de irmos ao login. */
export const CROSS_TAB_LOGIN_DELAY_MS = 1_500;

/**
 * Páginas de autenticação: login, cadastro, recuperar e redefinir senha,
 * verificar e-mail, aceitar convite e onboarding (wizard pós-cadastro).
 */
const AUTH_PATH_RE =
  /^\/(login|register|forgot-password|reset-password|verify-email|accept-invite|onboarding)(\/|$)/;

let handled = false;
let ended = false;
let stopWatching: (() => void) | null = null;

export function isSessionRevoked(status: number, code?: string | null): boolean {
  return status === 401 && code === SESSION_REVOKED_CODE;
}

/** A página atual é de autenticação? */
export function isAuthPage(pathname?: string): boolean {
  const path = pathname ?? (typeof window === "undefined" ? "" : window.location.pathname);
  return AUTH_PATH_RE.test(path);
}

/**
 * A sessão desta aba acabou (logout disparado aqui ou em outra aba)?
 * Os laços em segundo plano consultam antes de chamar a API de novo.
 */
export function isSessionEnded(): boolean {
  return ended;
}

/** Só para testes. */
export function __resetSessionRevokedForTests(): void {
  handled = false;
  ended = false;
  stopWatching?.();
  stopWatching = null;
}

async function defaultSignOut(): Promise<unknown> {
  const mod = await import("@/lib/sign-out-to-login");
  return mod.signOutToLogin();
}

function readGuard(): number | null {
  try {
    const value = Number(window.localStorage.getItem(SESSION_REVOKED_STORAGE_KEY) ?? 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return null; // storage indisponível: vale o guard em memória
  }
}

function isFresh(at: number, now: number): boolean {
  return at > 0 && now - at >= 0 && now - at < SESSION_REVOKED_GUARD_MS;
}

/**
 * - `signed-out`: esta chamada disparou o signOut;
 * - `already-handled`: outro request/aba já disparou (nada a fazer);
 * - `auth-page`: página de autenticação — não desloga;
 * - `renewal`: renovação da sessão em andamento — 401 esperado, não desloga;
 * - `unavailable`: fora do browser.
 */
export type UnauthorizedOutcome =
  | "signed-out"
  | "already-handled"
  | "auth-page"
  | "renewal"
  | "unavailable";

/**
 * 401 de um laço em segundo plano (ping/activity/SSE), com ou sem `code`:
 * signOut + login uma única vez por navegador.
 */
export function handleUnauthorized(
  signOut: () => Promise<unknown> = defaultSignOut,
): UnauthorizedOutcome {
  if (typeof window === "undefined") return "unavailable";
  if (isAuthPage()) return "auth-page";
  // Renovação em andamento: não marca nada — se ela falhar, o próximo 401
  // desloga normalmente.
  if (isSessionRenewalInProgress()) return "renewal";

  ended = true;
  if (handled) return "already-handled";

  const now = Date.now();
  const last = readGuard();
  if (last !== null) {
    // Outra aba (ou esta, antes de recarregar) já deslogou há pouco.
    if (isFresh(last, now)) return "already-handled";
    try {
      window.localStorage.setItem(SESSION_REVOKED_STORAGE_KEY, String(now));
    } catch {
      /* storage indisponível: vale o guard em memória */
    }
  }

  handled = true;
  void signOut().catch(() => {
    /* não insiste: `handled` segue true nesta página */
  });
  return "signed-out";
}

/**
 * 401 `SESSION_REVOKED` do cliente de API. Devolve `true` quando disparou
 * o signOut (para testes/telemetria).
 */
export function handleSessionRevoked(
  signOut: () => Promise<unknown> = defaultSignOut,
): boolean {
  return handleUnauthorized(signOut) === "signed-out";
}

async function goToLogin(): Promise<void> {
  const mod = await import("@/lib/sign-out-to-login");
  window.location.assign(mod.apexLoginUrl());
}

/**
 * Escuta o logout disparado por OUTRA aba (`storage` em
 * `crm:session-revoked-at`): esta aba para os laços e vai para o login sem
 * chamar o signOut de novo. Idempotente; devolve o unsubscribe.
 */
export function watchSessionEndInOtherTabs(
  navigate: () => Promise<void> | void = goToLogin,
): () => void {
  if (typeof window === "undefined") return () => {};
  if (stopWatching) return stopWatching;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onStorage = (e: StorageEvent) => {
    if (e.key !== SESSION_REVOKED_STORAGE_KEY || !e.newValue) return;
    if (!isFresh(Number(e.newValue), Date.now())) return;
    if (isAuthPage() || isSessionRenewalInProgress()) return;
    ended = true;
    if (handled) return;
    handled = true;
    // Dá tempo ao signOut da outra aba de apagar o cookie: chegar ao login
    // com o cookie ainda válido poderia mandar de volta para o app.
    timer = setTimeout(() => {
      timer = null;
      void Promise.resolve()
        .then(() => navigate())
        .catch(() => undefined);
    }, CROSS_TAB_LOGIN_DELAY_MS);
  };
  window.addEventListener("storage", onStorage);
  const off = () => {
    window.removeEventListener("storage", onStorage);
    if (timer) clearTimeout(timer);
    timer = null;
    if (stopWatching === off) stopWatching = null;
  };
  stopWatching = off;
  return off;
}
