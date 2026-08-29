/**
 * Adapter entre o DTO de atividade do backend e o tipo `Activity`
 * usado pela UI v2 (`@/lib/activities-data`).
 *
 * Backend `ActivityListItemDto`:
 *   - type: "CALL" | "MEETING" | "EMAIL" | "TASK" | "OTHER"
 *   - title, description, completed, scheduledAt (ISO|null), completedAt
 *   - contact, deal, user
 *
 * UI `Activity`:
 *   - kind: "tarefa" | "reuniao" | "ligacao" | "evento" | "email"
 *   - title, start (ISO local YYYY-MM-DDTHH:mm), status, withWhom, notes
 */

import type { Activity, ActivityKind } from "@/lib/activities-data";
import type { Task } from "@/lib/tasks-data";
import type { ActivityListItemDto, ActivityTypeDto } from "./api";

const TYPE_TO_KIND: Record<ActivityTypeDto, ActivityKind> = {
  CALL: "ligacao",
  MEETING: "reuniao",
  EMAIL: "email",
  TASK: "tarefa",
  OTHER: "evento",
};

const KIND_TO_TYPE: Record<ActivityKind, ActivityTypeDto> = {
  ligacao: "CALL",
  reuniao: "MEETING",
  email: "EMAIL",
  tarefa: "TASK",
  evento: "OTHER",
};

/** Converte ISO UTC (com Z) em YYYY-MM-DDTHH:mm local, sem timezone. */
function isoToLocalDateTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

/** Converte YYYY-MM-DDTHH:mm (hora local) em ISO completo para a API. */
export function localDateTimeToIso(localDt: string): string {
  if (!localDt) return new Date().toISOString();
  // `new Date("YYYY-MM-DDTHH:mm")` é interpretado como hora local
  const d = new Date(localDt);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

export function dtoToActivity(dto: ActivityListItemDto): Activity {
  const start = isoToLocalDateTime(dto.scheduledAt) || isoToLocalDateTime(dto.createdAt) || "";
  const isDept = !!dto.department;
  return {
    id: dto.id,
    kind: TYPE_TO_KIND[dto.type] ?? "tarefa",
    title: dto.title,
    start,
    status: dto.completed ? "concluida" : "pendente",
    withWhom: dto.contact?.name ?? dto.deal?.title ?? undefined,
    contactId: dto.contact?.id ?? null,
    contactName: dto.contact?.name ?? null,
    dealId: dto.deal?.id ?? null,
    dealTitle: dto.deal?.title ?? null,
    createdBy: dto.createdBy
      ? { id: dto.createdBy.id, name: dto.createdBy.name, avatarUrl: dto.createdBy.avatarUrl }
      : null,
    notes: dto.description ?? undefined,
    assigneeType: isDept ? "department" : "user",
    assigneeUserId: dto.user?.id ?? null,
    departmentId: dto.department?.id ?? null,
    assigneeLabel: dto.department?.name ?? dto.user?.name ?? null,
  };
}

export function activityKindToType(kind: ActivityKind): ActivityTypeDto {
  return KIND_TO_TYPE[kind] ?? "TASK";
}

/**
 * IDs persistidos pelo backend são cuid(). Fixtures locais / preview usam
 * prefixos (`mock-act-1`, `ac-1`, `t-local-*`, `a-<timestamp>`).
 * Esses IDs não existem em DELETE /api/activities/:id.
 */
const LOCAL_OR_MOCK_ACTIVITY_ID =
  /^(mock[-_]|t-local-|a-\d+$|ac-\d+$)/i;

export function isLiveActivityId(id: string): boolean {
  return Boolean(id) && !LOCAL_OR_MOCK_ACTIVITY_ID.test(id);
}

/** Agenda Google Calendar (TasksView) fala `Task`; a API fala `Activity`. */
export function activityToTask(activity: Activity): Task {
  const mins = activity.durationMin;
  const dealId = activity.dealId ?? null;
  const contactId = activity.contactId ?? null;
  return {
    id: activity.id,
    title: activity.title,
    type: activity.kind,
    start: activity.start,
    durationMin: mins && mins > 0 ? mins : 30,
    contact: activity.contactName ?? activity.withWhom,
    createdBy: activity.createdBy?.name ?? undefined,
    status: activity.status,
    entityKind: "tarefa",
    dealId,
    contactId,
    linkLabel: activity.dealTitle ?? undefined,
    linkHref: dealId
      ? `/pipeline/${dealId}`
      : contactId
        ? `/contacts/${contactId}`
        : undefined,
  };
}
