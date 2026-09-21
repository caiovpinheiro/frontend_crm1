export type TourId =
  | "pipeline"
  | "automations"
  | "contacts"
  | "bwipo-chat"
  | "bwipo-keeps";

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
  openMenu?: string;
  closeMenu?: string;
  skipIfMissing?: boolean;
  fallback?: string;
  fallbackLabel?: string;
  fallbackAnchor?: string;
  keepsFolder?: "notes" | "archive" | "trash";
  keepsView?: "normal" | "categories";
  keepsComposer?: "closed" | "note" | "checklist";
  keepsChatTab?: "conversa" | "keeps";
  /** Painel ilustrado na página do Keeps (pipeline / inbox), sem navegar. */
  keepsScene?: "pipeline" | "inbox";
};

export type PageTourCta = {
  label: string;
  onElement: string;
  href?: string;
  startTourId?: TourId;
};

export type PageTour = {
  id: TourId;
  steps: PageTourStep[];
  skipMissingElement?: boolean;
  ctas?: PageTourCta[];
};
