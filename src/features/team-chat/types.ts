export type TeamChatKind = "DM" | "GROUP" | "CHANNEL";

export type TeamChatDepartment = {
  id: string;
  name: string;
  color: string;
  icon: string;
};

export type TeamChatPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  systemOnline?: boolean;
  lastSeenAt?: string | null;
  role?: string;
  departmentId?: string | null;
};

export type TeamChatRoom = {
  id: string;
  kind: TeamChatKind;
  name: string;
  topic: string | null;
  avatarUrl: string | null;
  lastMessageAt: string;
  lastPreview: string | null;
  createdAt: string;
  unread: number;
  peer: TeamChatPerson | null;
  members: TeamChatPerson[];
  memberCount: number;
};

export type TeamChatReaction = {
  emoji: string;
  count: number;
  mine: boolean;
  userIds?: string[];
};

export type TeamChatAttachmentKind = "image" | "audio" | "video" | "file" | "sticker";

export type TeamChatAttachment = {
  url: string;
  name: string;
  mimeType: string;
  size: number;
  kind: TeamChatAttachmentKind;
  emoji?: string;
};

export type TeamChatMessage = {
  id: string;
  roomId: string;
  authorId: string | null;
  kind: "TEXT" | "SYSTEM";
  content: string;
  pinned: boolean;
  reactions: TeamChatReaction[];
  attachments?: TeamChatAttachment[];
  createdAt: string;
  author: TeamChatPerson | null;
};

export type TeamChatNote = {
  id: string;
  text: string;
  pinned: boolean;
  createdAt: string;
};

export type DirectRow = {
  room: TeamChatRoom | null;
  person: TeamChatPerson;
};
