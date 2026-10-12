/**
 * Última interação humana do navegador e logout por ociosidade.
 *
 * O backend encerra a sessão parada além de `sessionIdleMs` (padrão 12 h):
 * o ping leva `lastInteractionAt` e, ocioso além do limite, volta 401
 * `{ code: "SESSION_REVOKED", reason: "idle" }` — que cai no fluxo único de
 * `lib/session-revoked.ts`. Aqui fica o lado do navegador:
 *
 *  - o instante da última interação é COMPARTILHADO entre as abas
 *    (`localStorage["crm:last-interaction-at"]` + evento `storage`): usar
 *    uma aba mantém todas vivas, e a líder (que pinga) manda o valor do
 *    navegador inteiro;
 *  - contam só interações humanas — clique, tecla, rolagem, troca de rota,
 *    a aba voltar ao primeiro plano/foco e a abertura MANUAL da página
 *    (`features/system-usage/use-system-activity.ts`). Ping, SSE, refetch,
 *    polling, timers e recargas AUTOMÁTICAS (`markAutoReload`) NÃO chamam
 *    `mark`;
 *  - checagem local, para não depender do 401: a cada tique do ping
 *    (`hooks/presence-ticker.ts`) e ANTES de registrar cada interação. Se
 *    `agora - lastInteractionAt > sessionIdleMs`, sai pelo
 *    `handleUnauthorized` (uma vez por navegador; nada em página de
 *    autenticação). Assim quem volta ao foco depois do limite sai mesmo
 *    com a própria volta sendo uma interação;
 *  - `sessionIdleMs` vem do último 200 do ping e também é compartilhado
 *    (`crm:session-idle-ms`): uma seguidora que volta ao foco conhece o
 *    limite configurado. Sem o campo (backend antigo): 12 h.
 *
 * Gravação no storage limitada a 1 a cada 5 s (com gravação final do que
 * ficou para trás): digitar ou rolar não dispara um evento `storage` por
 * tecla em todas as abas. A memória da aba é sempre exata.
 */

import { handleUnauthorized, isSessionEnded } from "@/lib/session-revoked";

export const LAST_INTERACTION_STORAGE_KEY = "crm:last-interaction-at";
export const SESSION_IDLE_MS_STORAGE_KEY = "crm:session-idle-ms";
/** Limite padrão quando o backend não informa `sessionIdleMs`. */
export const DEFAULT_SESSION_IDLE_MS = 12 * 60 * 60_000;
/** No máximo uma gravação da última interação no storage a cada 5 s. */
export const LAST_INTERACTION_WRITE_MS = 5_000;
/**
 * Marca de recarga AUTOMÁTICA desta aba (`sessionStorage`, instante em ms).
 * Gravada antes do `location.reload()` que não veio do usuário; a página
 * nova a consome em `notePageOpen`.
 */
export const AUTO_RELOAD_STORAGE_KEY = "crm:auto-reload";
/** Marca mais velha que isto não vale (o reload marcado não aconteceu). */
export const AUTO_RELOAD_TTL_MS = 60_000;

export interface SessionIdleStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  /** Mudanças feitas por OUTRAS abas (evento `storage`). Devolve o unsubscribe. */
  subscribe?(fn: (key: string | null, value: string | null) => void): () => void;
}

function positive(raw: string | null | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export class SessionIdleClock {
  /** Última interação conhecida por esta aba (própria ou de outra aba). */
  private last: number | null = null;
  private limit: number | null = null;
  private lastWriteAt = Number.NEGATIVE_INFINITY;
  private trailing: ReturnType<typeof setTimeout> | null = null;
  private readonly off: () => void;

  constructor(private readonly storage: SessionIdleStorage) {
    this.off =
      storage.subscribe?.((key, value) => {
        if (key === LAST_INTERACTION_STORAGE_KEY) {
          const at = positive(value);
          if (at !== null && (this.last === null || at > this.last)) this.last = at;
        } else if (key === SESSION_IDLE_MS_STORAGE_KEY) {
          this.limit = positive(value);
        }
      }) ?? (() => {});
  }

  /** Último instante de interação humana em qualquer aba do navegador. */
  lastInteractionAt(): number | null {
    let stored: number | null = null;
    try {
      stored = positive(this.storage.get(LAST_INTERACTION_STORAGE_KEY));
    } catch {
      /* storage bloqueado: só a memória desta aba */
    }
    if (stored === null) return this.last;
    if (this.last === null) return stored;
    return Math.max(stored, this.last);
  }

  /** Registra uma interação humana desta aba. */
  mark(at: number = Date.now()): void {
    if (this.last === null || at > this.last) this.last = at;
    if (at - this.lastWriteAt >= LAST_INTERACTION_WRITE_MS) {
      this.write();
      return;
    }
    // Dentro da janela: grava o mais recente quando ela fechar.
    this.trailing ??= setTimeout(
      () => {
        this.trailing = null;
        this.write();
      },
      Math.max(0, this.lastWriteAt + LAST_INTERACTION_WRITE_MS - at),
    );
  }

  private write(): void {
    if (this.trailing) clearTimeout(this.trailing);
    this.trailing = null;
    const at = this.last;
    if (at === null) return;
    this.lastWriteAt = Date.now();
    try {
      // Outra aba pode ter gravado algo mais novo: nunca volta no tempo.
      const stored = positive(this.storage.get(LAST_INTERACTION_STORAGE_KEY));
      if (stored !== null && stored >= at) return;
      this.storage.set(LAST_INTERACTION_STORAGE_KEY, String(at));
    } catch {
      /* storage bloqueado: só a memória desta aba */
    }
  }

  /** Limite de ociosidade (ms): o do último 200 do ping, ou 12 h. */
  idleLimitMs(): number {
    try {
      const stored = positive(this.storage.get(SESSION_IDLE_MS_STORAGE_KEY));
      if (stored !== null) return stored;
    } catch {
      /* storage bloqueado */
    }
    return this.limit ?? DEFAULT_SESSION_IDLE_MS;
  }

  /** Limite informado pelo 200 do ping (`null`/inválido = padrão de 12 h). */
  setIdleLimitMs(ms: number | null | undefined): void {
    const value = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? ms : null;
    this.limit = value;
    const raw = String(value ?? DEFAULT_SESSION_IDLE_MS);
    try {
      if (this.storage.get(SESSION_IDLE_MS_STORAGE_KEY) !== raw) {
        this.storage.set(SESSION_IDLE_MS_STORAGE_KEY, raw);
      }
    } catch {
      /* storage bloqueado: só a memória desta aba */
    }
  }

  /** Parado além do limite? Sem nenhuma interação registrada, não. */
  isIdleExpired(now: number = Date.now()): boolean {
    const last = this.lastInteractionAt();
    if (last === null) return false;
    return now - last > this.idleLimitMs();
  }

  destroy(): void {
    if (this.trailing) clearTimeout(this.trailing);
    this.trailing = null;
    this.off();
  }
}

// ── Navegador ────────────────────────────────────────────────────────

export function browserSessionIdleStorage(): SessionIdleStorage {
  return {
    get: (key) => window.localStorage.getItem(key),
    set: (key, value) => window.localStorage.setItem(key, value),
    subscribe: (fn) => {
      const onStorage = (e: StorageEvent) => fn(e.key, e.newValue);
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
  };
}

let clock: SessionIdleClock | null = null;
let pageOpenNoted = false;

/** Relógio de ociosidade desta página (singleton); `null` fora do browser. */
export function sessionIdleClock(): SessionIdleClock | null {
  if (typeof window === "undefined") return null;
  clock ??= new SessionIdleClock(browserSessionIdleStorage());
  return clock;
}

/** Só para testes. */
export function __resetSessionIdleForTests(): void {
  clock?.destroy();
  clock = null;
  pageOpenNoted = false;
  stopOnlineWatch?.();
  stopOnlineWatch = null;
}

/**
 * Antes de um `location.reload()` AUTOMÁTICO (sem ação do usuário): a
 * página que abrir não conta como interação. Sem isso uma aba esquecida
 * seria "renovada" a cada recarga automática e nunca expiraria.
 */
export function markAutoReload(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTO_RELOAD_STORAGE_KEY, String(Date.now()));
  } catch {
    /* storage bloqueado: a recarga conta como abertura manual */
  }
}

/** Consome a marca de recarga automática (vale só se recente). */
function takeAutoReloadMark(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(AUTO_RELOAD_STORAGE_KEY);
    if (raw === null) return false;
    window.sessionStorage.removeItem(AUTO_RELOAD_STORAGE_KEY);
    const age = Date.now() - Number(raw);
    return Number.isFinite(age) && age >= 0 && age < AUTO_RELOAD_TTL_MS;
  } catch {
    return false;
  }
}

let stopOnlineWatch: (() => void) | null = null;

/**
 * O Serwist (`reloadOnOnline: true` em `next.config.ts`) recarrega a
 * página no evento `online` — ex.: notebook que acorda e reconecta. Essa
 * recarga é automática: marca antes. O `location.reload()` não interrompe
 * o despacho do evento, então a ordem entre os dois listeners não importa.
 * Idempotente.
 */
export function watchOnlineAutoReload(): () => void {
  if (typeof window === "undefined") return () => {};
  if (stopOnlineWatch) return stopOnlineWatch;
  const onOnline = () => markAutoReload();
  window.addEventListener("online", onOnline);
  const off = () => {
    window.removeEventListener("online", onOnline);
    if (stopOnlineWatch === off) stopOnlineWatch = null;
  };
  stopOnlineWatch = off;
  return off;
}

/**
 * Abertura desta página. Uma vez por página. Só marca a última interação
 * (não vai para o `interactionCount` do activity).
 *
 * - Abertura MANUAL (navegação, F5 do usuário): conta como interação e
 *   SEM checagem antes — vale também com a aba em segundo plano. Por que
 *   sem checagem: o login pode acontecer em outro host (apex →
 *   `{slug}.bwipo.com`), cujo storage guarda a última interação da sessão
 *   ANTERIOR; checar aqui deslogaria logo depois de entrar.
 * - Recarga AUTOMÁTICA (marca de `markAutoReload`: chunk velho depois de
 *   deploy, `online` do Serwist): NÃO conta, e faz a checagem normal —
 *   parado além do limite → logout.
 *
 * Quem ficou parado com a página aberta sai pelo tique ou pela checagem
 * antes da próxima interação (inclusive a volta ao foco).
 */
export function notePageOpen(
  c: SessionIdleClock | null = sessionIdleClock(),
  onExpired: () => unknown = endIdleSession,
): void {
  if (pageOpenNoted || !c) return;
  pageOpenNoted = true;
  if (takeAutoReloadMark()) {
    if (!isSessionEnded() && c.isIdleExpired()) onExpired();
    return;
  }
  c.mark();
}

/**
 * Logout por ociosidade: o mesmo caminho do 401 dos laços (uma vez por
 * navegador; nada em página de autenticação). `true` = a sessão acabou.
 */
export function endIdleSession(): boolean {
  return handleUnauthorized() !== "renewal";
}

/**
 * Interação humana nesta aba. Checa ANTES de registrar: parado além do
 * limite → logout e `false` (a interação não conta). Sessão já encerrada
 * (nesta ou em outra aba) → `false`.
 */
export function noteHumanInteraction(
  c: SessionIdleClock | null = sessionIdleClock(),
  onExpired: () => unknown = endIdleSession,
): boolean {
  if (!c || isSessionEnded()) return false;
  if (c.isIdleExpired()) {
    onExpired();
    return false;
  }
  c.mark();
  return true;
}
