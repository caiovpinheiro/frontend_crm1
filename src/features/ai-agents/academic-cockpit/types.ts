/**
 * Espelho do tipo `AcademicCockpit` do backend
 * (`src/services/ai/cockpit-academic.ts`), servido dentro de
 * `GET /api/public/agent-cockpit` no campo `academic`.
 */

export interface NamedCount {
  name: string;
  n: number;
}

export interface AcademicSaude {
  agentActive: boolean;
  agentName: string | null;
  spokeToday: number;
  attendingNow: number;
  resolvedSoloToday: number;
  handoffToday: number;
  sendFailedToday: number;
  firstResponseMedianSec: number | null;
}

export interface AcademicResolucao {
  closedByAiToday: number;
  closedByIdle: number;
  closedByStudentAsk: number;
  idleNudgesToday: number;
  returnedAfterAiClose: number;
}

export interface AcademicHandoff {
  totalToday: number;
  byDepartment: NamedCount[];
  byKind: NamedCount[];
}

export interface AcademicFunil {
  academicChannelSpoke: number;
  otherChannelSpoke: number;
  byStage: NamedCount[];
  leadDeEntradaOpen: number;
  leadDeEntradaWithAi: number;
}

export interface AcademicCockpit {
  saude: AcademicSaude;
  resolucao: AcademicResolucao;
  handoff: AcademicHandoff;
  funil: AcademicFunil;
}

export interface AgentCockpitResponse {
  generatedAt: string;
  academic?: AcademicCockpit;
}

/** Abas nativas do agente acadêmico dentro de "Agentes de IA". */
export type AcademicTabId = "saude" | "resolucao" | "handoff" | "funil";

export type AcademicCaseKey =
  | "spoke_today"
  | "attending_now"
  | "resolved_solo"
  | "closed_by_ai"
  | "closed_by_idle"
  | "closed_by_student"
  | "idle_nudges"
  | "returned_after_close"
  | "send_failed"
  | "handoff_today"
  | "handoff_assigned"
  | "channel_academic"
  | "channel_other"
  | "lead_entrada_open"
  | "lead_entrada_ai";

export interface AcademicCockpitCase {
  conversationId: string;
  conversationNumber: number | null;
  contactName: string;
  phone: string | null;
}
