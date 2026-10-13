/*
 * Textos de ajuda (ícone ?) do Dashboard, alinhados com o que o backend
 * documenta (be #187). Ficam todos aqui para trocar num lugar só.
 */
export const DASHBOARD_HELP_TEXT = {
  /**
   * "Ganhos por agente" → coluna "Em aberto" (`openToday`: carteira aberta
   * atual do dono, sem recorte de data).
   */
  agentsOpenToday:
    "Negócios abertos agora em que o agente é o dono, neste funil e filtros. Não depende do período escolhido.",
  /** Atendimentos → KPIs do período. */
  serviceFinished:
    "Finalizados: encerrados no período, de qualquer data de criação. Conversa encerrada só em outro app não aparece aqui.",
  /** "Em aberto — Iniciados" e "Em aberto — Aguardando" (mesma explicação). */
  serviceOpen:
    "Iniciados: conversas criadas no período. Em atendimento: as que ainda estão abertas e já tiveram resposta de uma pessoa (inclui resposta pelo app do celular). Aguardando: abertas sem nenhuma resposta humana ainda, mesmo que a IA tenha respondido.",
  /** Bloco "Agora". */
  serviceAgora: "Todas as conversas abertas agora, de qualquer data — não só as do período.",
} as const;
