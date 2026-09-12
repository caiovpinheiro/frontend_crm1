export type EmailEncryption = "NONE" | "SSL_TLS" | "STARTTLS";
export type EmailVisibility = "SHARED" | "PERSONAL";
export type EmailFolder = "INBOX" | "SENT" | "TRASH";

export interface EmailFolderUnread {
  inbox: number;
  sent: number;
  trash: number;
}

export interface EmailAccount {
  id: string;
  email: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: EmailEncryption;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
  visibility: EmailVisibility;
  groupInThreads: boolean;
  createContactsForReplies: boolean;
  ownerUserId: string | null;
  /** Não lidos na caixa de entrada (INBOX, sem pasta custom). */
  unreadCount: number;
  folderUnread?: EmailFolderUnread;
  oooEnabled?: boolean;
  oooMessage?: string | null;
  oooStartsAt?: string | null;
  oooEndsAt?: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
}

export interface EmailContact {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface EmailListItem {
  id: string;
  accountId: string;
  folder: EmailFolder;
  customFolderId: string | null;
  threadId: string;
  fromAddress: string;
  fromName: string | null;
  toAddress: string;
  subject: string | null;
  bodyText: string | null;
  isRead: boolean;
  receivedAt: string | null;
  contact: EmailContact | null;
}

export interface EmailDetail extends EmailListItem {
  bodyHtml: string | null;
  messageId: string | null;
  account: { id: string; email: string; visibility: EmailVisibility };
}

export interface EmailPagination {
  page: number;
  perPage: number;
  total: number;
  pages: number;
}

export interface ConnectEmailInput {
  email: string;
  password: string;
  imapHost: string;
  imapPort: number;
  imapEncryption: EmailEncryption;
  smtpHost: string;
  smtpPort: number;
  smtpEncryption: EmailEncryption;
  visibility: EmailVisibility;
  groupInThreads: boolean;
  createContactsForReplies: boolean;
}

export interface ApiFieldError {
  ok: false;
  field: string;
  message: string;
}

export interface EmailCustomFolder {
  id: string;
  accountId: string;
  name: string;
  color: string | null;
  createdAt: string;
  unreadCount: number;
}

export type EmailRuleField = "FROM" | "TO" | "SUBJECT" | "BODY" | "ALWAYS";
export type EmailRuleAction = "MOVE" | "TRASH" | "SPAM" | "FORWARD" | "REPLY" | "MARK_READ";

export interface EmailRule {
  id: string;
  accountId: string;
  name: string;
  isActive: boolean;
  conditionField: EmailRuleField;
  conditionValue: string;
  action: EmailRuleAction;
  targetFolderId: string | null;
  actionTarget: string | null;
  actionBody: string | null;
  priority: number;
  createdAt: string;
}

export interface EmailRuleInput {
  accountId: string;
  name: string;
  isActive?: boolean;
  conditionField: EmailRuleField;
  conditionValue: string;
  action: EmailRuleAction;
  targetFolderId?: string | null;
  actionTarget?: string | null;
  actionBody?: string | null;
  priority?: number;
}

export interface EmailOooSettings {
  oooEnabled: boolean;
  oooMessage: string | null;
  oooStartsAt: string | null;
  oooEndsAt: string | null;
}
