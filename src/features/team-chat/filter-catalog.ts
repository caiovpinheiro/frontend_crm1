export const TEAM_CHAT_LIST_TAB_IDS = ["all", "unread", "favorites"] as const;
export type TeamChatListTab = (typeof TEAM_CHAT_LIST_TAB_IDS)[number];

export type TeamChatListTabItem = {
  id: TeamChatListTab;
  label: string;
};

export const TEAM_CHAT_LIST_TABS: readonly TeamChatListTabItem[] = [
  { id: "all", label: "Tudo" },
  { id: "unread", label: "Não lidas" },
  { id: "favorites", label: "Favoritas" },
];

export const DEFAULT_TEAM_CHAT_LIST_TAB: TeamChatListTab = "all";

export function isTeamChatListTab(value: unknown): value is TeamChatListTab {
  return typeof value === "string" && (TEAM_CHAT_LIST_TAB_IDS as readonly string[]).includes(value);
}

export function emptyListLabel(tab: TeamChatListTab, searching: boolean): string {
  if (searching) return "Nenhuma conversa encontrada.";
  if (tab === "unread") return "Nenhuma conversa não lida.";
  if (tab === "favorites") return "Nenhuma conversa favorita.";
  return "Nenhuma conversa.";
}
