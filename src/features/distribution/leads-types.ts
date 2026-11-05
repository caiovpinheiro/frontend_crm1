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
 *   GET/POST /api/distribution/leads/department-rules  -> { rules } / { rule }
 *   PUT/DELETE /api/distribution/leads/department-rules/[id]
 *   GET /api/distribution/leads/department-rules/summary -> LeadsDepartmentRulesSummary
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
  /** Departamentos dos quais é membro. */
  departments: { id: string; name: string }[];
  /** Recebe lead agora? (status, peso, horário do departamento, liberação/pausa manual). */
  eligibility?: LeadsEligibilityDto;
  createdAt: string;
  updatedAt: string;
}

export type LeadsEligibilityReason =
  | "INACTIVE"
  | "WEIGHT_ZERO"
  | "OVERRIDE_INELIGIBLE"
  | "OVERRIDE_ELIGIBLE"
  | "RULES_OFF"
  | "DEPARTMENT_ACTIVE"
  | "OUT_OF_HOURS";

export interface LeadsEligibilityDto {
  eligibleNow: boolean;
  reason: LeadsEligibilityReason;
  /** Liberação (`eligible=true`) ou pausa manual vigente, com o fim. */
  override: { eligible: boolean; startsAt: string; endsAt: string } | null;
}

/** Liberar (`eligible=true`) ou pausar até `until` ("HH:MM", São Paulo). */
export interface LeadsEligibilityOverrideInput {
  eligible: boolean;
  until: string;
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

/** Kill switch do modo leads (independente do smart) + regras por departamento. */
export interface LeadsSettingsResponse {
  enabled: boolean;
  /**
   * Regras de horário por departamento. Ligado, só membros de departamento
   * com regra ativa no momento entram no sorteio. Desligado = rodízio de
   * sempre.
   */
  departmentRulesEnabled: boolean;
}

export interface UpdateLeadsSettingsInput {
  enabled?: boolean;
  departmentRulesEnabled?: boolean;
}

/** Regra de horário de um departamento (minutos do dia em America/Sao_Paulo). */
export interface LeadsDepartmentRuleDto {
  id: string;
  departmentId: string;
  departmentName: string;
  /** 0..1439. `startMinute > endMinute` = cruza a meia-noite. */
  startMinute: number;
  endMinute: number;
  /** 0 = domingo … 6 = sábado (dia do início). */
  weekdays: number[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeadsDepartmentRuleInput {
  departmentId: string;
  startMinute: number;
  endMinute: number;
  weekdays: number[];
  enabled: boolean;
}

export interface LeadsDepartmentSummaryDto {
  departmentId: string;
  name: string;
  color: string;
  icon: string;
  totalMembers: number;
  activeMembers: number;
  inactiveMembers: number;
  eligibleMembers: number;
  hasEnabledRule: boolean;
  availableNow: boolean;
  nextChangeAt: string | null;
  nextChangeKind: "activates" | "deactivates" | null;
  rules: LeadsDepartmentRuleDto[];
}

export interface LeadsDepartmentRulesSummary {
  rulesEnabled: boolean;
  serverNow: string;
  departments: LeadsDepartmentSummaryDto[];
}
