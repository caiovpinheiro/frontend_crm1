import type { DirectRow, TeamChatDepartment, TeamChatPerson } from "./types";

export const REACTION_EMOJIS = ["🔥", "👍", "❤️", "🎉", "👏", "😂", "🙌", "👀"] as const;

const AVATAR_TONES = [
  { bg: "var(--orbita-avatar-1)", fg: "var(--orbita-avatar-1-fg)" },
  { bg: "var(--orbita-avatar-2)", fg: "var(--orbita-avatar-2-fg)" },
  { bg: "var(--orbita-avatar-3)", fg: "var(--orbita-avatar-3-fg)" },
  { bg: "var(--orbita-avatar-4)", fg: "var(--orbita-avatar-4-fg)" },
  { bg: "var(--orbita-avatar-5)", fg: "var(--orbita-avatar-5-fg)" },
  { bg: "var(--orbita-avatar-6)", fg: "var(--orbita-avatar-6-fg)" },
] as const;

const CHANNEL_TONES = [
  { bg: "var(--orbita-channel-1-bg)", fg: "var(--orbita-channel-1-fg)" },
  { bg: "var(--orbita-channel-2-bg)", fg: "var(--orbita-channel-2-fg)" },
  { bg: "var(--orbita-channel-3-bg)", fg: "var(--orbita-channel-3-fg)" },
  { bg: "var(--orbita-channel-4-bg)", fg: "var(--orbita-channel-4-fg)" },
  { bg: "var(--orbita-channel-5-bg)", fg: "var(--orbita-channel-5-fg)" },
  { bg: "var(--orbita-channel-6-bg)", fg: "var(--orbita-channel-6-fg)" },
] as const;

export type ChatPerson = {
  id: string;
  name: string;
  initials: string;
  presence: "online" | "away" | "offline";
  avatarUrl?: string | null;
};

const AWAY_MS = 15 * 60 * 1000;

export function presenceOf(p: Pick<TeamChatPerson, "systemOnline" | "lastSeenAt">): ChatPerson["presence"] {
  if (p.systemOnline) return "online";
  if (p.lastSeenAt) {
    const age = Date.now() - new Date(p.lastSeenAt).getTime();
    if (Number.isFinite(age) && age >= 0 && age < AWAY_MS) return "away";
  }
  return "offline";
}

export const PRESENCE_DOT: Record<ChatPerson["presence"], string> = {
  online: "var(--color-online)",
  away: "#f59e0b",
  offline: "var(--color-offline)",
};

export const PRESENCE_TEXT: Record<ChatPerson["presence"], string> = {
  online: "var(--color-online)",
  away: "#f59e0b",
  offline: "var(--orbita-text-secondary)",
};

export function initialsOf(name: string) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function hashOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

export function getOrbitaAvatarTone(id: string) {
  return AVATAR_TONES[hashOf(id) % AVATAR_TONES.length];
}

export function getOrbitaChannelTonal(id: string) {
  return CHANNEL_TONES[hashOf(id) % CHANNEL_TONES.length];
}

const NAME_COLORS = [
  "var(--orbita-name-1)",
  "var(--orbita-name-2)",
  "var(--orbita-name-3)",
  "var(--orbita-name-4)",
  "var(--orbita-name-5)",
  "var(--orbita-name-6)",
] as const;

export function getOrbitaNameColor(id: string) {
  return NAME_COLORS[hashOf(id) % NAME_COLORS.length];
}

function isProductMarkUrl(url: string) {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  return (
    path.endsWith("/bwipo-icon.png") ||
    path === "bwipo-icon.png" ||
    path.endsWith("/bwipo-chat-light.png") ||
    path.endsWith("/bwipo-chat-dark.png")
  );
}

export function normalizeAvatarUrl(url?: string | null): string | null {
  const value = url?.trim();
  if (!value || isProductMarkUrl(value)) return null;
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("/")
  ) {
    return value;
  }
  return `/${value}`;
}

export function toPerson(
  p: Pick<TeamChatPerson, "id" | "name" | "avatarUrl" | "systemOnline" | "lastSeenAt">,
): ChatPerson {
  const name = p.name?.trim() || "Colega";
  return {
    id: p.id,
    name,
    initials: initialsOf(name),
    presence: presenceOf(p),
    avatarUrl: normalizeAvatarUrl(p.avatarUrl),
  };
}

export function formatClock(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function formatListTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (same(d, yest)) return "Ontem";
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);
  if (d > weekAgo) return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatDayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date();
  yest.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, today)) return "Hoje";
  if (same(d, yest)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function dayKey(iso: string) {
  return new Date(iso).toDateString();
}

export const presenceLabel = {
  online: "Online agora",
  away: "Ausente",
  offline: "Offline",
} as const;

export const UNASSIGNED_DEPT_ID = "__none__";

export type DepartmentDirectSection = {
  id: string;
  name: string;
  color: string | null;
  rows: DirectRow[];
};

export function groupDirectsByDepartment(
  directs: DirectRow[],
  departments: TeamChatDepartment[],
): DepartmentDirectSection[] {
  if (departments.length === 0) {
    return directs.length > 0 ? [{ id: "directs", name: "Diretas", color: null, rows: directs }] : [];
  }

  const known = new Map(departments.map((d) => [d.id, d]));
  const buckets = new Map<string, DirectRow[]>();
  for (const row of directs) {
    const raw = row.person.departmentId;
    const id = raw && known.has(raw) ? raw : UNASSIGNED_DEPT_ID;
    const list = buckets.get(id);
    if (list) list.push(row);
    else buckets.set(id, [row]);
  }

  const sections: DepartmentDirectSection[] = departments
    .filter((d) => (buckets.get(d.id)?.length ?? 0) > 0)
    .map((d) => ({ id: d.id, name: d.name, color: d.color, rows: buckets.get(d.id)! }));

  const none = buckets.get(UNASSIGNED_DEPT_ID);
  if (none?.length) {
    sections.push({ id: UNASSIGNED_DEPT_ID, name: "Sem departamento", color: null, rows: none });
  }
  return sections;
}

const FAVORITES_KEY = "orbita-chat-favorites";

export function loadOrbitaFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveOrbitaFavorites(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

export function favoriteKey(row: { roomId?: string | null; personId?: string | null }) {
  return row.roomId || (row.personId ? `person:${row.personId}` : "");
}

export function meFromSession(
  name: string | null | undefined,
  id: string,
  avatarUrl?: string | null,
): ChatPerson {
  const display = name?.trim() || "Você";
  return {
    id: id || "me",
    name: display,
    initials: initialsOf(display),
    presence: "online" as const,
    avatarUrl: normalizeAvatarUrl(avatarUrl),
  };
}
