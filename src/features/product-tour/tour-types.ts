export type TourId =
  | "pipeline"
  | "automations"
  | "automations-create"
  | "automations-builder"
  | "bwipo-chat"
  | "campaigns"
  | "campaigns-create"
  | "campaigns-detail"
  | "contacts"
  | "contacts-create"
  | "contacts-columns"
  | "contacts-duplicates"
  | "custom-fields"
  | "custom-fields-create"
  | "dashboard"
  | "dashboard-service"
  | "dashboard-operator"
  | "inbox"
  | "tasks"
  | "tasks-create"
  | "logs"
  | "logs-calls"
  | "logs-stats"
  | "logs-usage"
  | "settings"
  | "security"
  | "security-api"
  | "security-flags"
  | "tabulations"
  | "tabulations-dashboard"
  | "tabulations-create"
  | "team"
  | "team-schedule"
  | "team-departments"
  | "team-user-create"
  | "team-schedule-create"
  | "team-department-create"
  | "message-models"
  | "message-models-internal"
  | "message-models-whatsapp"
  | "message-models-flows"
  | "message-models-create"
  | "message-models-internal-create"
  | "message-models-whatsapp-create"
  | "distribution"
  | "distribution-coverage"
  | "distribution-queue"
  | "distribution-logs"
  | "distribution-edit";

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
  /** Troca a aba da Distribuição antes de destacar o passo. */
  distributionTab?: "team" | "coverage" | "queue" | "logs";
  /** Troca a aba da página Logs antes de destacar o passo. */
  logsTab?: 0 | 1 | 2 | 3;
  /** Troca a aba de Equipe (0 Usuários, 1 Expediente, 2 Departamentos). */
  teamTab?: 0 | 1 | 2;
  /** Troca a aba de Modelos de mensagem antes de destacar o passo. */
  modelsTab?: "overview" | "internal" | "whatsapp" | "flows";
  /** Troca a aba de Segurança (Permissões / API / Feature flags). */
  securityTab?: "permissions" | "api" | "flags";
  /** Troca Papéis/Pessoas e seleciona o primeiro item da lista. */
  securityAccess?: "role" | "user";
  /** Troca Árvore / Dashboard em Tabulações. */
  tabulationsView?: "tree" | "dashboard";
  /** Troca Negócios / Atendimentos no Dashboard. */
  dashboardTab?: "deals" | "service";
  /**
   * Se o alvo não existir, injeta um modelo de exemplo (fantasma) com este
   * `data-tour` para o tour mostrar o passo mesmo sem dados/permissão.
   */
  fallback?: "auto-inbound" | "menu-item" | "row-action" | "header-control" | "generic" | "inbox-chat" | "bwipo-chat-thread";
  /** Texto do item fantasma quando `fallback` é "menu-item". */
  fallbackLabel?: string;
  /** `data-tour` do elemento-âncora para o fantasma "generic". */
  fallbackAnchor?: string;
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
