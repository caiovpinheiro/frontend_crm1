export type TourId = "pipeline" | "automations" | "contacts" | "bwipo-chat";

export type TourSide = "top" | "right" | "bottom" | "left";

/**
 * Passo de um tour de página. `element` é o valor de `data-tour` no DOM
 * (nunca um seletor CSS frágil).
 */
export type PageTourStep = {
  element: string;
  title: string;
  description: string;
  side?: TourSide;
  fallback?: string;
};

export type PageTour = {
  id: TourId;
  steps: PageTourStep[];
  skipMissingElement?: boolean;
};
