import type { PageTour, TourId } from "./tour-types";
import { pipelineTour } from "./tours/pipeline-tour";

/**
 * Tours por id. Novas páginas: criar `tours/<id>-tour.ts` e registrar aqui.
 * O mapa de rotas é só documentação para o próximo passo — o botão da página
 * passa o `tourId` explicitamente (não há auto-start por pathname).
 */
const TOURS: Partial<Record<TourId, PageTour>> = {
  pipeline: pipelineTour,
  // automations: automationsTour,
  // contacts: contactsTour,
};

export const TOUR_BY_PATH: Partial<Record<string, TourId>> = {
  "/pipeline": "pipeline",
  // "/automations": "automations",
  // "/contacts": "contacts",
};

export function getTour(id: string): PageTour | undefined {
  return TOURS[id as TourId];
}

export function hasTour(id: string): boolean {
  return getTour(id) != null;
}
