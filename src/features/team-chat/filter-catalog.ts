import {
  IconMail,
  IconStar,
  IconUser,
  IconUsersGroup,
  type Icon as TablerIcon,
} from "@tabler/icons-react";

export const TEAM_CHAT_QUEUE_IDS = ["directs", "groups", "unread", "favorites"] as const;
export type TeamChatQueueId = (typeof TEAM_CHAT_QUEUE_IDS)[number];

export type TeamChatQueueGroupId = "conversations" | "action" | "personal";

export type TeamChatQueueItem = {
  id: TeamChatQueueId;
  label: string;
  description: string;
  group: TeamChatQueueGroupId;
  groupLabel: string;
  groupTone: string;
  Icon: TablerIcon;
  iconBg: string;
  iconFg: string;
};

export const TEAM_CHAT_QUEUES: readonly TeamChatQueueItem[] = [
  {
    id: "directs",
    label: "Diretas",
    description: "Conversas um a um",
    group: "conversations",
    groupLabel: "Conversas",
    groupTone: "text-[var(--text-muted)]",
    Icon: IconUser,
    iconBg: "var(--color-enterprise-bg)",
    iconFg: "var(--brand-primary)",
  },
  {
    id: "groups",
    label: "Grupos",
    description: "Canais e grupos do time",
    group: "conversations",
    groupLabel: "Conversas",
    groupTone: "text-[var(--text-muted)]",
    Icon: IconUsersGroup,
    iconBg: "var(--color-lavender-soft, var(--color-info-bg))",
    iconFg: "var(--color-lavender, var(--brand-primary))",
  },
  {
    id: "unread",
    label: "Não lidas",
    description: "Com mensagens sem leitura",
    group: "action",
    groupLabel: "Precisa de ação",
    groupTone: "text-[var(--color-warning)]",
    Icon: IconMail,
    iconBg: "var(--color-warn-bg)",
    iconFg: "var(--color-warn)",
  },
  {
    id: "favorites",
    label: "Favoritas",
    description: "Marcadas com estrela",
    group: "personal",
    groupLabel: "Pessoal",
    groupTone: "text-[var(--brand-primary)]",
    Icon: IconStar,
    iconBg: "var(--color-info-bg)",
    iconFg: "var(--brand-primary)",
  },
];

export const DEFAULT_TEAM_CHAT_QUEUES: TeamChatQueueId[] = ["directs", "groups"];

export function isTeamChatQueueId(value: unknown): value is TeamChatQueueId {
  return typeof value === "string" && (TEAM_CHAT_QUEUE_IDS as readonly string[]).includes(value);
}

export function sanitizeTeamChatQueues(ids: readonly unknown[]): TeamChatQueueId[] {
  return TEAM_CHAT_QUEUE_IDS.filter((id) => ids.includes(id));
}

export function groupTeamChatQueues(
  items: readonly TeamChatQueueItem[] = TEAM_CHAT_QUEUES,
): { id: TeamChatQueueGroupId; label: string; tone: string; items: TeamChatQueueItem[] }[] {
  const groups: {
    id: TeamChatQueueGroupId;
    label: string;
    tone: string;
    items: TeamChatQueueItem[];
  }[] = [];
  for (const item of items) {
    const existing = groups.find((g) => g.id === item.group);
    if (existing) existing.items.push(item);
    else {
      groups.push({
        id: item.group,
        label: item.groupLabel,
        tone: item.groupTone,
        items: [item],
      });
    }
  }
  return groups;
}

export function teamChatQueueById(id: TeamChatQueueId): TeamChatQueueItem | undefined {
  return TEAM_CHAT_QUEUES.find((q) => q.id === id);
}

export function teamChatSelectedSum(
  selectedIds: readonly TeamChatQueueId[],
  counts: Partial<Record<TeamChatQueueId, number>>,
): number {
  return selectedIds.reduce((n, id) => n + (counts[id] ?? 0), 0);
}
