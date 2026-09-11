/*
 * Tipos da Distribuição por Leads (modo "leads") — configuração própria,
 * independente da Distribuição Inteligente (smart).
 *
 * Endpoints backend (widget `smart_distribution`):
 *   GET  /api/distribution/leads/participants          -> { participants }
 *   POST /api/distribution/leads/participants          -> { added, skipped, participants }
 *   PUT  /api/distribution/leads/participants/[userId] -> { participant }
 *   GET /api/distribution/leads/stats?from&to&userId   -> LeadsStatsResponse
 *   GET /api/distribution/leads/history?...            -> LeadsHistoryResponse
 */

export interface LeadsSlotDto {
  slotIndex: number;
  /** slotIndex < weight do participante ACTIVE. */
  active: boolean;
  lastAssignedAt: string | null;
}

export interface LeadsParticipantDto {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  /** Status administrativo próprio do modo leads. */
  status: "ACTIVE" | "INACTIVE";
  /** Peso 0–5: quantos dos 5 slots entram no rodízio. 0 = não recebe. */
  weight: number;
  /** Observação administrativa do consultor (modo leads). */
  note: string;
  slots: LeadsSlotDto[];
  totalReceived: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsParticipantsResponse {
  participants: LeadsParticipantDto[];
}

export interface UpdateLeadsParticipantInput {
  status?: "ACTIVE" | "INACTIVE";
  weight?: number;
  note?: string | null;
}

export interface BulkAddLeadsParticipantsInput {
  userIds: string[];
  status?: "ACTIVE" | "INACTIVE";
  weight?: number;
}

export interface BulkAddLeadsParticipantsResponse {
  added: number;
  skipped: number;
  participants: LeadsParticipantDto[];
}

export interface LeadsStatsEntry {
  userId: string;
  name: string | null;
  count: number;
}

export interface LeadsStatsResponse {
  total: number;
  byUser: LeadsStatsEntry[];
  ranking: LeadsStatsEntry[];
}

export interface LeadsHistoryItemDto {
  id: string;
  createdAt: string;
  userId: string;
  userName: string | null;
  slotIndex: number;
  targetKey: string;
  contactId: string | null;
  dealId: string | null;
  conversationId: string | null;
  leadLabel: string | null;
  triggerSource: string;
}

export interface LeadsHistoryResponse {
  items: LeadsHistoryItemDto[];
  nextCursor: string | null;
  total: number;
}

export interface LeadsHistoryFilters {
  from?: string;
  to?: string;
  userId?: string;
}

/** Kill switch do modo leads (independente do smart). */
export interface LeadsSettingsResponse {
  enabled: boolean;
}
