export type TeamChatKind = "DM" | "GROUP";

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
  workItemId?: string | null;
};

export type CrmAnchorType = "deal" | "conversation" | "contact";

export type CrmCard =
  | {
      kind: "crm";
      restricted: false;
      type: CrmAnchorType;
      id: string;
      number: number | null;
      title: string;
      typeLabel: string;
      status: string | null;
      ownerName: string | null;
      value: number | null;
      href: string;
    }
  | {
      kind: "crm";
      restricted: true;
      type: CrmAnchorType;
      typeLabel: string;
    };

export type RecordSearchHit = {
  type: CrmAnchorType;
  id: string;
  number: number | null;
  title: string;
  subtitle: string | null;
  href: string;
};

export type WorkItemType = "checklist" | "ata" | "pauta" | "feedback" | "meeting";

export type WorkItemEntryInput = {
  text: string;
  assigneeId?: string | null;
  dueAt?: string | null;
};

export type WorkItemEntry = {
  id: string;
  text: string;
  assigneeId: string | null;
  assigneeName: string | null;
  dueAt: string | null;
  status: "open" | "done";
  sortOrder: number;
  completedAt: string | null;
};

export type WorkItem = {
  id: string;
  type: WorkItemType;
  title: string;
  originType: string;
  originId: string;
  roomId: string | null;
  visibility: string;
  createdById: string;
  createdByName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  callUrl: string | null;
  recurrenceKey: string | null;
  participantIds: string[];
  createdAt: string;
  done: number;
  total: number;
  entries: WorkItemEntry[];
  crmCard: CrmCard | null;
  originLabel: string | null;
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
