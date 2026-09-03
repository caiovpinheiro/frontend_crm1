import type { PageTour, TourId } from "./tour-types";
import { automationsBuilderTour } from "./tours/automations-builder-tour";
import { automationsCreateTour } from "./tours/automations-create-tour";
import { automationsTour } from "./tours/automations-tour";
import { bwipoChatTour } from "./tours/bwipo-chat-tour";
import { campaignsCreateTour } from "./tours/campaigns-create-tour";
import { campaignsDetailTour } from "./tours/campaigns-detail-tour";
import { campaignsTour } from "./tours/campaigns-tour";
import { contactsColumnsTour } from "./tours/contacts-columns-tour";
import { contactsCreateTour } from "./tours/contacts-create-tour";
import { contactsDuplicatesTour } from "./tours/contacts-duplicates-tour";
import { contactsTour } from "./tours/contacts-tour";
import { customFieldsCreateTour } from "./tours/custom-fields-create-tour";
import { customFieldsTour } from "./tours/custom-fields-tour";
import { dashboardOperatorTour } from "./tours/dashboard-operator-tour";
import { dashboardServiceTour } from "./tours/dashboard-service-tour";
import { dashboardTour } from "./tours/dashboard-tour";
import { distributionEditTour } from "./tours/distribution-edit-tour";
import { distributionCoverageTour } from "./tours/distribution-coverage-tour";
import { distributionLogsTour } from "./tours/distribution-logs-tour";
import { distributionQueueTour } from "./tours/distribution-queue-tour";
import { distributionTour } from "./tours/distribution-tour";
import { inboxTour } from "./tours/inbox-tour";
import { logsCallsTour } from "./tours/logs-calls-tour";
import { logsStatsTour } from "./tours/logs-stats-tour";
import { logsTour } from "./tours/logs-tour";
import { logsUsageTour } from "./tours/logs-usage-tour";
import { messageModelsCreateTour } from "./tours/message-models-create-tour";
import { messageModelsFlowsTour } from "./tours/message-models-flows-tour";
import { messageModelsInternalCreateTour } from "./tours/message-models-internal-create-tour";
import { messageModelsInternalTour } from "./tours/message-models-internal-tour";
import { messageModelsTour } from "./tours/message-models-tour";
import { messageModelsWhatsappCreateTour } from "./tours/message-models-whatsapp-create-tour";
import { messageModelsWhatsappTour } from "./tours/message-models-whatsapp-tour";
import { pipelineTour } from "./tours/pipeline-tour";
import { securityApiTour } from "./tours/security-api-tour";
import { securityFlagsTour } from "./tours/security-flags-tour";
import { securityTour } from "./tours/security-tour";
import { settingsTour } from "./tours/settings-tour";
import { tabulationsCreateTour } from "./tours/tabulations-create-tour";
import { tabulationsDashboardTour } from "./tours/tabulations-dashboard-tour";
import { tabulationsTour } from "./tours/tabulations-tour";
import { tasksCreateTour } from "./tours/tasks-create-tour";
import { tasksTour } from "./tours/tasks-tour";
import { teamDepartmentCreateTour } from "./tours/team-department-create-tour";
import { teamDepartmentsTour } from "./tours/team-departments-tour";
import { teamScheduleCreateTour } from "./tours/team-schedule-create-tour";
import { teamScheduleTour } from "./tours/team-schedule-tour";
import { teamTour } from "./tours/team-tour";
import { teamUserCreateTour } from "./tours/team-user-create-tour";

/**
 * Tours por id. Novas páginas: criar `tours/<id>-tour.ts` e registrar aqui.
 * O mapa de rotas é só documentação para o próximo passo — o botão da página
 * passa o `tourId` explicitamente (não há auto-start por pathname).
 */
const TOURS: Partial<Record<TourId, PageTour>> = {
  pipeline: pipelineTour,
  automations: automationsTour,
  "automations-create": automationsCreateTour,
  "automations-builder": automationsBuilderTour,
  "bwipo-chat": bwipoChatTour,
  campaigns: campaignsTour,
  "campaigns-create": campaignsCreateTour,
  "campaigns-detail": campaignsDetailTour,
  contacts: contactsTour,
  "contacts-create": contactsCreateTour,
  "contacts-columns": contactsColumnsTour,
  "contacts-duplicates": contactsDuplicatesTour,
  "custom-fields": customFieldsTour,
  "custom-fields-create": customFieldsCreateTour,
  dashboard: dashboardTour,
  "dashboard-service": dashboardServiceTour,
  "dashboard-operator": dashboardOperatorTour,
  inbox: inboxTour,
  logs: logsTour,
  "logs-calls": logsCallsTour,
  "logs-stats": logsStatsTour,
  "logs-usage": logsUsageTour,
  "message-models": messageModelsTour,
  "message-models-internal": messageModelsInternalTour,
  "message-models-whatsapp": messageModelsWhatsappTour,
  "message-models-flows": messageModelsFlowsTour,
  "message-models-create": messageModelsCreateTour,
  "message-models-internal-create": messageModelsInternalCreateTour,
  "message-models-whatsapp-create": messageModelsWhatsappCreateTour,
  settings: settingsTour,
  security: securityTour,
  "security-api": securityApiTour,
  "security-flags": securityFlagsTour,
  tabulations: tabulationsTour,
  "tabulations-dashboard": tabulationsDashboardTour,
  "tabulations-create": tabulationsCreateTour,
  team: teamTour,
  "team-schedule": teamScheduleTour,
  "team-departments": teamDepartmentsTour,
  "team-user-create": teamUserCreateTour,
  "team-schedule-create": teamScheduleCreateTour,
  "team-department-create": teamDepartmentCreateTour,
  tasks: tasksTour,
  "tasks-create": tasksCreateTour,
  distribution: distributionTour,
  "distribution-coverage": distributionCoverageTour,
  "distribution-queue": distributionQueueTour,
  "distribution-logs": distributionLogsTour,
  "distribution-edit": distributionEditTour,
};

export const TOUR_BY_PATH: Partial<Record<string, TourId>> = {
  "/pipeline": "pipeline",
  "/automations": "automations",
  "/automations/new": "automations-create",
  "/campaigns": "campaigns",
  "/campaigns/new": "campaigns-create",
  "/contacts": "contacts",
  "/dashboard": "dashboard",
  "/inbox": "inbox",
  "/bwipo-chat": "bwipo-chat",
  "/logs": "logs",
  "/settings": "settings",
  "/settings/security": "security",
  "/settings/tabulations": "tabulations",
  "/settings/custom-fields": "custom-fields",
    "/settings/team": "team",
    "/settings/message-models": "message-models",
  "/activities": "tasks",
  "/widgets/distribution": "distribution",
  // "/campaigns/[id]": "campaigns-detail",
  // "/automations/[id]": "automations-builder",
};

export function getTour(id: string): PageTour | undefined {
  return TOURS[id as TourId];
}

export function hasTour(id: string): boolean {
  return getTour(id) != null;
}
