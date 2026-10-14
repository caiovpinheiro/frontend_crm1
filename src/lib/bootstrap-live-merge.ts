/**
 * Merge ÚNICO "corpo estável (v2) + voláteis do `/api/me/live`" (be #193).
 *
 * Com `x-bootstrap-version: 2` o backend tira os campos que mudam a todo
 * instante de duas rotas (no bloco do bootstrap E na chamada direta):
 *   - `/api/users` (e `?includeAi=1`): sem `agentStatus`, `systemOnline`,
 *     `lastSeenAt` → `live.usersPresence[userId]`;
 *   - `/api/settings/departments` (ADMIN/MANAGER): sem
 *     `_count.conversations` → `live.departmentCounts[deptId].openConversations`.
 * Aqui o corpo legado é reconstruído EXATAMENTE como o backend testa:
 *   user = { ...estável, ...(usersPresence[id] ?? { systemOnline: false,
 *            lastSeenAt: null, agentStatus: null }) }
 *   dept = { ...estável, _count: { ...estável._count,
 *            conversations: departmentCounts?.[id]?.openConversations ?? 0 } }
 *
 * Usado por `lib/shell-bootstrap.ts` (semeadura e GETs em voo) e por
 * `lib/api.ts` (chamadas diretas). Chamada direta só vai com o cabeçalho
 * v2 quando há um live recente (`LIVE_OVERLAY_FRESH_MS`) para o merge;
 * senão vai sem ele e recebe o corpo legado completo — presença e
 * contagens nunca ficam mais velhas que as do backend (o refetch de
 * segurança de 5 min dos usuários continua corrigindo quedas do SSE).
 */

export const BOOTSTRAP_VERSION_HEADER = "x-bootstrap-version";

/** Live mais velho que isto não serve ao merge de chamada direta (cache do backend ~30 s). */
export const LIVE_OVERLAY_FRESH_MS = 30_000;

type LiveVolatiles = {
  usersPresence?: Record<string, unknown> | null;
  departmentCounts?: Record<string, unknown> | null;
};

type Kind = "users" | "departments";

/** Blocos do bootstrap v2 que esperam o live para serem semeados. */
const OVERLAY_BLOCK_URLS: Readonly<Record<string, Kind>> = {
  "/api/users": "users",
  "/api/settings/departments": "departments",
};

/** Chamadas diretas que aceitam o cabeçalho v2 (formato estável). */
const V2_DIRECT_PATHS: Readonly<Record<string, Kind>> = {
  "/api/users": "users",
  "/api/users?includeAi=1": "users",
  "/api/settings/departments": "departments",
};

export function liveOverlayFor(url: string): Kind | undefined {
  return OVERLAY_BLOCK_URLS[url];
}

const USER_OFFLINE = { systemOnline: false, lastSeenAt: null, agentStatus: null };
const LIST_KEYS = ["items", "users", "departments", "data"] as const;

function mapList(body: unknown, fn: (item: Record<string, unknown>) => unknown): unknown {
  const map = (list: unknown[]) =>
    list.map((item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? fn(item as Record<string, unknown>)
        : item,
    );
  if (Array.isArray(body)) return map(body);
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    for (const key of LIST_KEYS) {
      if (Array.isArray(rec[key])) return { ...rec, [key]: map(rec[key] as unknown[]) };
    }
  }
  return body;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function mergeUsers(body: unknown, presence: unknown): unknown {
  // `usersPresence` ausente (live antigo) ou `null` (sem org): como veio.
  if (!isRecord(presence)) return body;
  return mapList(body, (user) => {
    const id = typeof user.id === "string" ? user.id : null;
    const extra = id && isRecord(presence[id]) ? presence[id] : USER_OFFLINE;
    return { ...user, ...(extra as object) };
  });
}

function mergeDepartments(body: unknown, counts: unknown): unknown {
  // Sem `_count` (não-admin) o corpo legado também não tem a contagem.
  const byId = isRecord(counts) ? counts : null;
  return mapList(body, (dept) => {
    if (!isRecord(dept._count)) return dept;
    const id = typeof dept.id === "string" ? dept.id : "";
    const entry = byId && isRecord(byId[id]) ? byId[id] : null;
    const open = entry && typeof entry.openConversations === "number" ? entry.openConversations : 0;
    return { ...dept, _count: { ...dept._count, conversations: open } };
  });
}

function mergeKind(kind: Kind, body: unknown, live: LiveVolatiles): unknown {
  return kind === "users"
    ? mergeUsers(body, live.usersPresence)
    : mergeDepartments(body, live.departmentCounts);
}

/** Bloco estável do bootstrap v2 + live → corpo legado (URL sem overlay: como veio). */
export function mergeLiveIntoBlock(url: string, body: unknown, live: LiveVolatiles | null | undefined): unknown {
  const kind = liveOverlayFor(url);
  if (!kind || !live) return body;
  return mergeKind(kind, body, live);
}

// ── Chamadas diretas ─────────────────────────────────────────────────

let lastLive: { at: number; live: LiveVolatiles } | null = null;

/** O live desta página (para o merge das chamadas diretas). */
export function rememberLive(live: LiveVolatiles, at: number = Date.now()): void {
  lastLive = { at, live };
}

/** Só para testes. */
export function forgetLiveForTests(): void {
  lastLive = null;
}

/** GET direto desta URL vai com o cabeçalho v2 (há live recente para o merge)? */
export function directV2Kind(path: string, now: number = Date.now()): Kind | undefined {
  const kind = V2_DIRECT_PATHS[path];
  if (!kind || !lastLive) return undefined;
  return now - lastLive.at < LIVE_OVERLAY_FRESH_MS ? kind : undefined;
}

/** Corpo estável de uma chamada direta v2 → corpo legado. */
export function mergeDirectBody(kind: Kind, body: unknown): unknown {
  return lastLive ? mergeKind(kind, body, lastLive.live) : body;
}
