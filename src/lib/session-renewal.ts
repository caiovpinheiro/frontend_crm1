/**
 * Renovação da sessão atual depois de o PRÓPRIO usuário revogar as demais
 * (troca de senha, "sair dos outros dispositivos").
 *
 * O backend incrementa a versão da sessão — todo cookie antigo passa a
 * responder 401 `SESSION_REVOKED`, inclusive o desta aba — e devolve na
 * resposta `sessionRenewal: { token, sessionVersion }`: uma prova de uso
 * único (60 s). Com ela o `update()` do `useSession`
 * (`POST /api/auth/session`) reemite o cookie na versão nova e esta sessão
 * continua; as outras caem. Sem prova (backend antigo) ou se a renovação
 * falhar, vale o comportamento anterior: login.
 *
 * Janela de corrida: entre o backend incrementar a versão e o cookie novo
 * chegar, qualquer requisição desta aba OU de outra aba do mesmo navegador
 * (polling, presença, SSE) leva 401 `SESSION_REVOKED` — e o tratamento
 * padrão (`session-revoked.ts`) faria signOut, apagando o cookie que a
 * renovação acabou de (ou está para) receber. Por isso a renovação é
 * anunciada ANTES do pedido (`beginSessionRenewal`), em memória e no
 * `localStorage` (as outras abas enxergam), e o signOut automático fica
 * suspenso enquanto ela durar, mais uma folga curta para as respostas que
 * já estavam a caminho com o cookie antigo. A suspensão tem teto
 * (`SESSION_RENEWAL_WINDOW_MS`): se algo travar, o 401 volta a deslogar.
 *
 * Sem import estático de `next-auth/react`: este módulo é importado por
 * `session-revoked.ts` → `lib/api.ts`, que também roda no servidor.
 */

export type SessionRenewalGrant = {
  /** Prova de uso único devolvida pelo backend. */
  token: string;
  /** Versão que a sessão deve ter depois de renovada. */
  sessionVersion: number;
};

/** `update()` do `useSession`. */
export type SessionUpdateFn = (data?: unknown) => Promise<unknown>;

const STORAGE_KEY = "crm:session-renewal-until";
/** Teto da suspensão do signOut automático (pedido + renovação). */
export const SESSION_RENEWAL_WINDOW_MS = 20_000;
/** Folga depois de renovar: respostas em voo com o cookie antigo. */
export const SESSION_RENEWAL_GRACE_MS = 5_000;
/** `update()` devolve `undefined` se o SessionProvider estava ocupado. */
const RETRY_DELAY_MS = 400;
const MAX_ATTEMPTS = 2;

let localUntil = 0;

function writeStorage(until: number): void {
  if (typeof window === "undefined") return;
  try {
    if (until > 0) window.localStorage.setItem(STORAGE_KEY, String(until));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage indisponível: vale só a marca em memória (esta aba) */
  }
}

function readStorage(): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY) ?? 0);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

/** Anuncia a renovação. Chame ANTES do pedido que incrementa a versão. */
export function beginSessionRenewal(now: number = Date.now()): void {
  localUntil = now + SESSION_RENEWAL_WINDOW_MS;
  writeStorage(localUntil);
}

/**
 * Encerra o anúncio. `renewed: true` mantém a suspensão por uma folga
 * curta; `false` libera na hora (o próximo 401 revogado desloga).
 */
export function endSessionRenewal(renewed: boolean, now: number = Date.now()): void {
  localUntil = renewed ? now + SESSION_RENEWAL_GRACE_MS : 0;
  writeStorage(localUntil);
}

/** Há uma renovação em andamento nesta aba ou em outra do navegador? */
export function isSessionRenewalInProgress(now: number = Date.now()): boolean {
  if (now < localUntil) return true;
  const until = readStorage();
  // Valor além do teto = lixo (relógio alterado, outra versão): ignora.
  return until > now && until - now <= SESSION_RENEWAL_WINDOW_MS;
}

/** Lê `sessionRenewal` do corpo de uma resposta do backend. */
export function parseSessionRenewal(payload: unknown): SessionRenewalGrant | null {
  if (typeof payload !== "object" || payload === null) return null;
  const raw = (payload as { sessionRenewal?: unknown }).sessionRenewal;
  if (typeof raw !== "object" || raw === null) return null;
  const { token, sessionVersion } = raw as { token?: unknown; sessionVersion?: unknown };
  if (typeof token !== "string" || token.length === 0) return null;
  if (typeof sessionVersion !== "number" || !Number.isInteger(sessionVersion)) return null;
  return { token, sessionVersion };
}

function sessionVersionOf(session: unknown): number | null {
  if (typeof session !== "object" || session === null) return null;
  const user = (session as { user?: unknown }).user;
  if (typeof user !== "object" || user === null) return null;
  const version = (user as { sessionVersion?: unknown }).sessionVersion;
  return typeof version === "number" ? version : null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Troca a prova pelo cookie na versão nova. `true` só quando a sessão
 * devolvida já está na versão esperada. Tenta de novo uma vez: `update()`
 * devolve `undefined` quando o SessionProvider estava ocupado e `null`
 * numa falha de rede — nos dois casos a prova pode ainda não ter sido
 * usada (e o backend aceita a repetição de uma renovação que deu certo).
 */
export async function renewCurrentSession(
  update: SessionUpdateFn,
  grant: SessionRenewalGrant,
  retryDelayMs: number = RETRY_DELAY_MS,
): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    let session: unknown = null;
    try {
      session = await update({ sessionRenewal: grant.token });
    } catch {
      session = null;
    }
    if (sessionVersionOf(session) === grant.sessionVersion) return true;
    if (attempt < MAX_ATTEMPTS) await sleep(retryDelayMs);
  }
  return false;
}

export type SessionRenewalOutcome<T> = {
  result: T;
  /**
   * - `kept`: esta sessão foi renovada e continua valendo.
   * - `lost`: havia prova, mas a renovação falhou — a sessão caiu; leve o
   *   usuário ao login.
   * - `not_offered`: o backend não devolveu prova (versão antiga do
   *   backend, ou o pedido não revogava nada). Nada a fazer aqui.
   */
  session: "kept" | "lost" | "not_offered";
};

/**
 * Executa um pedido que revoga as sessões do usuário e, se o backend
 * devolver a prova, renova a sessão atual. O signOut automático por 401
 * revogado fica suspenso durante todo o processo (ver topo).
 */
export async function runWithSessionRenewal<T>(
  request: () => Promise<T>,
  update: SessionUpdateFn,
  retryDelayMs?: number,
): Promise<SessionRenewalOutcome<T>> {
  beginSessionRenewal();
  let kept = false;
  try {
    const result = await request();
    const grant = parseSessionRenewal(result);
    if (!grant) return { result, session: "not_offered" };
    kept = await renewCurrentSession(update, grant, retryDelayMs);
    return { result, session: kept ? "kept" : "lost" };
  } finally {
    endSessionRenewal(kept);
  }
}

/** Só para testes. */
export function __resetSessionRenewalForTests(): void {
  localUntil = 0;
  writeStorage(0);
}
