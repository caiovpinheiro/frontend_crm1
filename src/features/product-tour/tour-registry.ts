import type { PageTour, TourId } from "./tour-types";
import { automationsBuilderTour } from "./tours/automations-builder-tour";
import { automationsCreateTour } from "./tours/automations-create-tour";
import { automationsTour } from "./tours/automations-tour";
import { campaignsCreateTour } from "./tours/campaigns-create-tour";
import { campaignsDetailTour } from "./tours/campaigns-detail-tour";
import { campaignsTour } from "./tours/campaigns-tour";
import { contactsColumnsTour } from "./tours/contacts-columns-tour";
import { contactsCreateTour } from "./tours/contacts-create-tour";
import { contactsDuplicatesTour } from "./tours/contacts-duplicates-tour";
import { contactsTour } from "./tours/contacts-tour";
import { inboxTour } from "./tours/inbox-tour";
import { pipelineTour } from "./tours/pipeline-tour";

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
  campaigns: campaignsTour,
  "campaigns-create": campaignsCreateTour,
  "campaigns-detail": campaignsDetailTour,
  contacts: contactsTour,
  "contacts-create": contactsCreateTour,
  "contacts-columns": contactsColumnsTour,
  "contacts-duplicates": contactsDuplicatesTour,
  inbox: inboxTour,
};

export const TOUR_BY_PATH: Partial<Record<string, TourId>> = {
  "/pipeline": "pipeline",
  "/automations": "automations",
  "/automations/new": "automations-create",
  "/campaigns": "campaigns",
  "/campaigns/new": "campaigns-create",
  "/contacts": "contacts",
  "/inbox": "inbox",
  // "/campaigns/[id]": "campaigns-detail",
  // "/automations/[id]": "automations-builder",
};

export function getTour(id: string): PageTour | undefined {
  return TOURS[id as TourId];
}

export function hasTour(id: string): boolean {
  return getTour(id) != null;
}
