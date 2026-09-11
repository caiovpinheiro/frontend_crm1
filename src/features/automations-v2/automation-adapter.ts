/**
 * Adapter entre `AutomationListItemDto` do backend e o tipo `Automation`
 * usado pela UI v2 (`@/lib/automations-data`).
 *
 * Métricas (`runs`, `runsToday`, `successRate`, `lastRunAt`) vêm da
 * janela de hoje no backend. O `lastRunAt` (ISO ou null) é convertido
 * aqui para texto relativo pt-BR exibido no card.
 */

import type { Automation, AutomationTrigger } from "@/lib/automations-data";
import type { AutomationListItemDto } from "./api";

// Espelha o `triggerTypeLabel` do backend (src/lib/automation-workflow.ts).
// IMPORTANTE: o backend manda `triggerType` em snake_case lowercase
// (ex.: "deal_created"). Mapear com chaves UPPERCASE como antes fazia o
// lookup falhar em 100% dos casos e cair no fallback "Negócio criado",
// que era exibido para qualquer automação independente do gatilho real.
const TRIGGER_LABEL: Record<string, AutomationTrigger> = {
  deal_created: "Negócio criado",
  deal_won: "Negócio ganho",
  deal_lost: "Negócio perdido",
  stage_changed: "Estágio alterado",
  tag_added: "Tag adicionada",
  lead_score_reached: "Lead score atingido",
  contact_created: "Contato criado",
  conversation_created: "Conversa criada",
  lifecycle_changed: "Ciclo de vida alterado",
  agent_changed: "Agente alterado",
  message_received: "Mensagem recebida",
  message_sent: "Mensagem enviada",
  call_received: "Ligação recebida",
  call_made: "Ligação realizada",
  call_permission_granted: "Permissão de ligação concedida",
  manual: "Manual",
};

/**
 * Fallback para `triggerType` que ainda não está no mapa (novos gatilhos
 * adicionados no backend antes do frontend ser atualizado). Formata o
 * snake_case para Title Case ("custom_event" -> "Custom event") em vez de
 * mentir "Negócio criado", que escondia o tipo real de várias automações.
 */
function formatUnknownTrigger(t: string | undefined | null): AutomationTrigger {
  if (!t) return "—" as AutomationTrigger;
  const cleaned = t.replace(/_/g, " ").trim();
  if (!cleaned) return "—" as AutomationTrigger;
  return (cleaned.charAt(0).toUpperCase() + cleaned.slice(1)) as AutomationTrigger;
}

const ACCENTS: Automation["accent"][] = ["blue", "purple", "mint", "coral", "teal"];

function pickAccent(id: string): Automation["accent"] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

/** Rota do editor. Nunca emite `/automations/undefined`. */
export function automationEditorPath(
  id: string | number | null | undefined,
): string {
  const s = id == null ? "" : String(id).trim();
  if (!s || s === "undefined" || s === "null") return "/automations";
  return `/automations/${s}`;
}

export function isUsableAutomationRouteId(id: string | undefined): id is string {
  return !!id && id !== "undefined" && id !== "null";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Converte um ISO (ou null) na "última execução" em texto relativo pt-BR. */
function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return "agora";
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `há ${days} d`;
  return d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function dtoToAutomation(dto: AutomationListItemDto): Automation {
  const id =
    (typeof dto.id === "string" && dto.id) ||
    (dto.number != null ? String(dto.number) : "");
  return {
    id,
    name: dto.name,
    description: dto.description ?? "",
    trigger: TRIGGER_LABEL[dto.triggerType] ?? formatUnknownTrigger(dto.triggerType),
    steps: dto.stepCount,
    stepTypes: dto.stepTypes ?? [],
    updatedAt: formatDate(dto.updatedAt),
    active: dto.active,
    runs: dto.runs ?? 0,
    runsToday: dto.runsToday ?? 0,
    successRate: dto.successRate ?? 0,
    lastRun: formatRelative(dto.lastRunAt),
    accent: pickAccent(id || "0"),
  };
}
