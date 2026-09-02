export type TourId =
  | "pipeline"
  | "automations"
  | "automations-create"
  | "automations-builder"
  | "campaigns"
  | "campaigns-create"
  | "campaigns-detail"
  | "contacts"
  | "contacts-create"
  | "contacts-columns"
  | "contacts-duplicates"
  | "inbox";

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
  /**
   * Passo do assistente (Nova automação / Nova campanha) a exibir antes de destacar o alvo.
   */
  wizardStep?: 1 | 2 | 3;
  /** Abre o menu deste `data-tour` antes de destacar o passo. */
  openMenu?: string;
  /** Fecha o menu deste `data-tour` antes de destacar o passo. */
  closeMenu?: string;
  /** Abre a paleta Blocos do builder. */
  openPalette?: boolean;
  /** Abre o catálogo “O que deseja automatizar?”. */
  openPicker?: boolean;
  /** Centraliza o gatilho no canvas (React Flow). */
  focusTrigger?: boolean;
  /** Pula o passo se o alvo não existir ( paleta no mobile, node sem saída). */
  skipIfMissing?: boolean;
};

export type PageTourCta = {
  label: string;
  /** Passo (`element`) em que o botão extra aparece. */
  onElement: string;
  /** Abre o menu cujo trigger tem este `data-tour`. */
  openMenu?: string;
  /** Avança o tour atual (depois de abrir o menu, se houver). */
  continueTour?: boolean;
  href?: string;
  startTourId?: TourId;
};

export type PageTour = {
  id: TourId;
  steps: PageTourStep[];
  ctas?: PageTourCta[];
  /** Default true. False no assistente, senão passos futuros somem do DOM. */
  skipMissingElement?: boolean;
};
