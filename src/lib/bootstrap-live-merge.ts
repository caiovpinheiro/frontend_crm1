/**
 * Merge ÚNICO "bloco estável (bootstrap v2) + voláteis do live".
 *
 * No modo v2 o backend tira de alguns blocos os campos que mudam a todo
 * instante (para o ETag do bootstrap ficar estável) e os manda em
 * `GET /api/me/live`, à parte, por id:
 *   - `/api/users` sem presença → `live.usersPresence: { [userId]: {...} }`
 *   - `/api/settings/departments` sem contagens → `live.departmentCounts:
 *     { [departmentId]: {...} }`
 * Aqui o objeto que as telas usam hoje é reconstruído (campos do live por
 * cima do item estável com o mesmo `id`). Campo ausente no live = bloco
 * como veio (backend antigo, ou ajuste ainda não publicado).
 *
 * Quem usa: `lib/shell-bootstrap.ts` ao semear e ao servir GETs em voo.
 * As chamadas individuais dessas rotas vão SEM o cabeçalho v2 (formato
 * completo, sempre correto); trocar isso é mudar só `LIVE_OVERLAYS`.
 */

export type LiveOverlay = {
  /** URL do bloco estável (chave em `blocks`). */
  url: string;
  /** Campo do `/api/me/live` com os voláteis por id. */
  field: string;
};

export const LIVE_OVERLAYS: readonly LiveOverlay[] = [
  { url: "/api/users", field: "usersPresence" },
  { url: "/api/settings/departments", field: "departmentCounts" },
];

export function liveOverlayFor(url: string): LiveOverlay | undefined {
  return LIVE_OVERLAYS.find((o) => o.url === url);
}

const LIST_KEYS = ["items", "users", "departments", "data"] as const;

function mergeList(list: unknown[], byId: Record<string, unknown>): unknown[] {
  return list.map((item) => {
    if (!item || typeof item !== "object") return item;
    const id = (item as { id?: unknown }).id;
    const extra = typeof id === "string" ? byId[id] : undefined;
    return extra && typeof extra === "object" && !Array.isArray(extra)
      ? { ...(item as object), ...(extra as object) }
      : item;
  });
}

/**
 * Corpo estável de `url` + voláteis do live. Aceita lista pura ou
 * `{ items | users | departments | data: [...] }` (mesmas formas que os
 * hooks normalizam). Sem overlay para a URL ou sem o campo: o corpo como
 * veio.
 */
export function mergeLiveIntoBlock(
  url: string,
  body: unknown,
  live: Record<string, unknown> | null | undefined,
): unknown {
  const overlay = liveOverlayFor(url);
  if (!overlay || !live) return body;
  const byId = live[overlay.field];
  if (!byId || typeof byId !== "object" || Array.isArray(byId)) return body;
  const map = byId as Record<string, unknown>;
  if (Array.isArray(body)) return mergeList(body, map);
  if (body && typeof body === "object") {
    const rec = body as Record<string, unknown>;
    for (const key of LIST_KEYS) {
      if (Array.isArray(rec[key])) return { ...rec, [key]: mergeList(rec[key] as unknown[], map) };
    }
  }
  return body;
}
