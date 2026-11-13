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
  /** Nome no WhatsApp (a sincronização atualiza). */
  name: string;
  /** Apelido só no CRM; quando existe, a tela mostra ele no lugar de `name`. */
  customName?: string | null;
  description: string | null;
  ownerJid: string | null;
  participantCount: number;
  syncedAt: string;
  /** Última mensagem recebida ou enviada (ordena a lista). */
  lastMessageAt: string | null;
  /** Prévia da última mensagem (uma linha). */
  lastMessagePreview: string | null;
  /** Quem mandou a última; nulo quando foi o próprio número. */
  lastMessageAuthor: string | null;
  lastMessageFromMe: boolean;
  /** Não lidas desde o último "visto" (compartilhado por todos do número). */
  unreadCount: number;
};

export type WhatsAppGroupCompanyRef = { id: string; number: number; name: string };

export type WhatsAppGroupDetail = WhatsAppGroupListItem & {
  members: WhatsAppGroupMember[];
  /** Empresa do CRM vinculada ao grupo. */
  company: WhatsAppGroupCompanyRef | null;
};

export type WhatsAppGroupsListResponse = {
  connected: boolean;
  channel: { id: string; name: string; phoneNumber: string | null } | null;
  groups: WhatsAppGroupListItem[];
};

export type WhatsAppGroupMessage = {
  id: string;
  fromJid: string;
  fromName: string | null;
  fromPhone: string | null;
  fromMe: boolean;
  text: string;
  /** text | image | video | audio | ptt | document | sticker. */
  messageType: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  /** Uma por remetente ("me" = o próprio número). */
  reactions: GroupReaction[];
  /** Mensagem citada (resposta). */
  replyTo: { waId: string; text: string; author: string | null } | null;
  /** Tem id do WhatsApp: dá para reagir e responder. */
  canReact: boolean;
  createdAt: string;
};

export type GroupReaction = { emoji: string; from: string; name: string | null };

export type WhatsAppGroupMemberOpen = {
  contactId: string;
  conversationId: string;
  dealId: string | null;
};

/** Foto, vídeo ou documento do grupo ("Mídia, links e docs"). */
export type GroupMediaItem = {
  id: string;
  messageType: string;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  text: string;
  /** "Você" quando foi o próprio número. */
  author: string;
  fromMe: boolean;
  createdAt: string;
};

export type GroupLinkItem = {
  id: string;
  url: string;
  domain: string;
  snippet: string;
  author: string;
  fromMe: boolean;
  createdAt: string;
};

export type GroupMediaCounts = { media: number; docs: number; links: number };

export type GroupMediaSummary = { counts: GroupMediaCounts; recent: GroupMediaItem[] };

export type GroupMediaTab = "media" | "docs" | "links";
