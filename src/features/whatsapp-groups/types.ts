export type WhatsAppGroupMember = {
  id: string;
  jid: string;
  phone: string | null;
  name: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
};

export type WhatsAppGroupListItem = {
  id: string;
  jid: string;
  name: string;
  description: string | null;
  ownerJid: string | null;
  participantCount: number;
  syncedAt: string;
};

export type WhatsAppGroupDetail = WhatsAppGroupListItem & {
  members: WhatsAppGroupMember[];
};

export type WhatsAppGroupsListResponse = {
  connected: boolean;
  channel: { id: string; name: string; phoneNumber: string | null } | null;
  groups: WhatsAppGroupListItem[];
};
