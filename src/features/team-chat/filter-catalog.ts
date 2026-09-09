import {
  IconMessages,
  IconStar,
  IconUsers,
  IconInbox,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

export type TeamChatFilterId = "diretas" | "grupos" | "unread" | "favorites";

export type TeamChatFilterItem = {
  id: TeamChatFilterId;
  label: string;
  description: string;
  group: "chats" | "attention" | "personal";
  groupLabel: string;
  groupTone: string;
};

export const TEAM_CHAT_FILTERS: readonly TeamChatFilterItem[] = [
  {
    id: "diretas",
    label: "Diretas",
    description: "Conversas um a um",
    group: "chats",
    groupLabel: "Conversas",
    groupTone: "text-[var(--inbox-brand)]",
  },
  {
    id: "grupos",
    label: "Grupos",
    description: "Canais e grupos do time",
    group: "chats",
    groupLabel: "Conversas",
    groupTone: "text-[var(--inbox-brand)]",
  },
  {
    id: "unread",
    label: "Não lidas",
    description: "Com mensagens novas",
    group: "attention",
    groupLabel: "Precisa de ação",
    groupTone: "text-[var(--inbox-sla-warn)]",
  },
  {
    id: "favorites",
    label: "Favoritas",
    description: "Marcadas com estrela",
    group: "personal",
    groupLabel: "Pessoal",
    groupTone: "text-[var(--inbox-sla-ok)]",
  },
];

export const DEFAULT_TEAM_CHAT_FILTERS: TeamChatFilterId[] = ["diretas", "grupos"];

export type TeamChatFilterCounts = Partial<Record<TeamChatFilterId, number>>;

export type TeamChatFilterChip = {
  id: TeamChatFilterId;
  label: string;
  count?: number;
};

function selectedItems(
  ids: readonly string[],
  items: readonly TeamChatFilterItem[] = TEAM_CHAT_FILTERS,
): TeamChatFilterItem[] {
  return items.filter((item) => ids.includes(item.id));
}

export function teamChatFilterTriggerLabel(
  selectedIds: readonly string[],
  counts?: TeamChatFilterCounts | null,
): string {
  const selected = selectedItems(selectedIds);
  if (selected.length === 0) return "Selecione filas";
  if (selected.length === 1) {
    const item = selected[0]!;
    const n = counts?.[item.id];
    if (typeof n === "number") return `${item.label} · ${n.toLocaleString("pt-BR")}`;
    return item.label;
  }
  return `${selected.length} filas`;
}

export function teamChatFilterChips(
  selectedIds: readonly string[],
  counts?: TeamChatFilterCounts | null,
): TeamChatFilterChip[] {
  return selectedItems(selectedIds).map((item) => {
    const n = counts?.[item.id];
    return {
      id: item.id,
      label: item.label,
      count: typeof n === "number" ? n : undefined,
    };
  });
}

export function teamChatFilterSelectedCount(
  selectedIds: readonly string[],
  counts?: TeamChatFilterCounts | null,
): number | undefined {
  const selected = selectedItems(selectedIds);
  if (selected.length === 0 || !counts) return undefined;
  let sum = 0;
  for (const item of selected) {
    const n = counts[item.id];
    if (typeof n !== "number") return undefined;
    sum += n;
  }
  return sum;
}

export function toggleTeamChatFilter(
  current: readonly TeamChatFilterId[],
  id: TeamChatFilterId,
): TeamChatFilterId[] {
  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
  return TEAM_CHAT_FILTERS.map((item) => item.id).filter((fid) => next.includes(fid));
}

export function teamChatFilterVisual(id: TeamChatFilterId): {
  Icon: TablerIcon;
  bg: string;
  fg: string;
} {
  if (id === "diretas")
    return { Icon: IconMessages, bg: "var(--color-info-bg)", fg: "var(--inbox-brand)" };
  if (id === "grupos")
    return { Icon: IconUsers, bg: "var(--color-lavender-soft)", fg: "var(--color-lavender)" };
  if (id === "unread")
    return { Icon: IconInbox, bg: "var(--color-warn-subtle)", fg: "var(--inbox-sla-warn)" };
  return { Icon: IconStar, bg: "var(--color-success-bg)", fg: "var(--inbox-sla-ok)" };
}
