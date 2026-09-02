/** Tipos da Distribuição Inteligente (frontend). Espelham o backend
 *  (`services/distribution/*`). */

export type AgentOnlineStatus = "ONLINE" | "OFFLINE" | "AWAY";

export type DistributionBlockReason =
  | "INACTIVE"
  | "OFFLINE"
  | "ON_PAUSE"
  | "OUTSIDE_WORKING_HOURS"
  | "PRE_LUNCH"
  | "PRE_END"
  | "QUEUE_LIMIT_REACHED"
  | "TYPE_INCOMPATIBLE"
  | "DEPARTMENT_MISMATCH";

export interface ResponsibleScheduleDto {
  startTime: string;
  lunchStart: string;
  lunchEnd: string;
  endTime: string;
  timezone: string;
  weekdays: number[];
  /** Expediente de sábado por consultor. */
  saturdayEnabled?: boolean;
  saturdayStart?: string;
  saturdayEnd?: string;
}

export interface ResponsibleDepartmentRef {
  id: string;
  name: string;
}

export interface DistributionResponsibleDto {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl?: string | null;
  role: string;
  participates: boolean;
  queueLimit: number;
  volume: number;
  type: string | null;
  paused: boolean;
  /**
   * Minutos de antecedência (pré-almoço e pré-fim de expediente).
   * Default 30.
   */
  preLunchStopMinutes?: number;
  lastExecutionAt: string | null;
  /** Departamentos dos quais é membro (roteamento por departamento). */
  departments?: ResponsibleDepartmentRef[];
  status: AgentOnlineStatus | null;
  hasSchedule: boolean;
  /** Expediente (null se não configurado). */
  schedule?: ResponsibleScheduleDto | null;
  queueCount: number;
  eligible: boolean;
  blockedReasons: DistributionBlockReason[];
  /**
   * Presença de USO do CRM ("aba aberta") — separada do `status`
   * (Online/Ausente/Offline da Distribuição). Alimentada pelo
   * heartbeat global do frontend.
   */
  systemOnline?: boolean;
  lastSeenAt?: string | null;
}

export interface ResponsiblesResponse {
  responsibles: DistributionResponsibleDto[];
}

export interface EvaluatedResponsibleSummary {
  userId: string;
  name: string | null;
  eligible: boolean;
  blockedReasons: DistributionBlockReason[];
  queueCount: number;
}

export type DistributionReason =
  | "ASSIGNED"
  | "SMART_DISTRIBUTION_NOT_ENABLED"
  | "NO_ELIGIBLE_RESPONSIBLE"
  | "NO_DEPARTMENT"
  | "RETIRED_WHATSAPP_CHANNEL"
  | "QUEUED";

export interface DistributionResult {
  success: boolean;
  reason: DistributionReason;
  selectedUserId: string | null;
  selectedUserName: string | null;
  evaluated: EvaluatedResponsibleSummary[];
}

export interface PendingDistributionDto {
  id: string;
  number?: number | null;
  dealId: string | null;
  contactId: string | null;
  label: string;
  /** Canal de origem (WHATSAPP, INSTAGRAM, FACEBOOK, EMAIL, WEBCHAT). */
  channel: string;
  departmentId?: string | null;
  departmentName?: string | null;
  distributionType: string | null;
  triggerSource: string;
  attempts: number;
  lastAttemptAt: string;
  createdAt: string;
}

export interface PendingResponse {
  pending: PendingDistributionDto[];
  total?: number;
  nextCursor?: string | null;
}

export interface RetryResult {
  resolved: number;
  cancelled: number;
  pending: number;
  skipReason?: string | null;
  skipMessage?: string | null;
}

export type RedistributeMode = "equal" | "specific" | "to_pending";
export type RedistributeQueueScope = "all" | "entrada" | "aguardando";

export interface RedistributeInput {
  mode: RedistributeMode;
  recipientUserIds?: string[];
  queueScope?: RedistributeQueueScope;
}

export interface RedistributeResult {
  moved: number;
  skipped: number;
  total: number;
  recipients: { userId: string; name: string | null; received: number }[];
}

export interface UpdateResponsibleInput {
  participates?: boolean;
  paused?: boolean;
  queueLimit?: number;
  volume?: number;
  type?: string | null;
  preLunchStopMinutes?: number;
  /** Substitui o conjunto de departamentos do responsável. */
  departmentIds?: string[];
  /** Upsert parcial do AgentSchedule (almoço / expediente). */
  schedule?: {
    startTime?: string;
    lunchStart?: string;
    lunchEnd?: string;
    endTime?: string;
    timezone?: string;
    weekdays?: number[];
    saturdayEnabled?: boolean;
    saturdayStart?: string;
    saturdayEnd?: string;
  };
}

/** Rótulos PT-BR dos motivos de bloqueio (para tooltips/badges). */
export const BLOCK_REASON_LABELS: Record<DistributionBlockReason, string> = {
  INACTIVE: "Inativo (bloqueado pelo admin)",
  OFFLINE: "Offline",
  ON_PAUSE: "Em pausa / ausente",
  OUTSIDE_WORKING_HOURS: "Fora do expediente",
  PRE_LUNCH: "Pré-almoço / almoço",
  PRE_END: "Pré-fim de expediente",
  QUEUE_LIMIT_REACHED: "Fila cheia",
  TYPE_INCOMPATIBLE: "Tipo incompatível",
  DEPARTMENT_MISMATCH: "Fora do departamento",
};
