/**
 * Achados dos validadores da configuração (API `/validate`) e o lugar da
 * tela onde cada campo se corrige. Puro, sem React.
 */

export type ValidationSeverity = "bloqueia" | "avisa";

export type ValidationFinding = {
  code: string;
  severity: ValidationSeverity;
  agentId: string;
  /** Campo da configuração (ex.: "themes[2].when[0]"). */
  path: string;
  message: string;
  evidence?: string;
};

export type ValidationTarget = { section: string; tab?: string; themeId?: string; label: string };

/** Rótulo curto por tipo de achado (cai no código quando não há). */
export const FINDING_LABEL: Record<string, string> = {
  destino_sem_id: "Destino sem escolha",
  destino_inexistente: "Destino não existe",
  destino_desligado: "Destino desligado",
  destino_motor_antigo: "Destino no motor antigo",
  autotransferencia: "Transfere para si mesmo",
  ciclo_entre_agentes: "Ping-pong entre agentes",
  agente_orfao: "Ninguém chega a ele",
  departamento_sem_usuario: "Departamento vazio",
  gatilho_repetido: "Gatilho em dois assuntos",
  gatilho_palavra_solta: "Gatilho de uma palavra",
  gatilho_cumprimento: "Gatilho é cumprimento",
  assunto_vazio: "Assunto sem conteúdo",
  calendario_mes_divergente: "Mês do título ≠ data",
  calendario_evento_duplicado: "Evento duplicado",
  calendario_so_passado: "Calendário só no passado",
  campo_inexistente: "Campo que não existe",
  campo_variante_acento: "Campo com/sem acento",
  tabulacao_inexistente: "Tabulação não existe",
  fluxo_fala_com_cliente_no_encerramento: "Fluxo fala no encerramento",
  fluxo_encerramento_nao_roda_pelo_agente: "Fluxo não roda pelo agente",
};

const SECTION_LABEL: Record<string, string> = {
  inicio: "Início",
  quem: "Quem é o agente",
  sabe: "O que ele sabe",
  cuida: "Do que ele cuida",
  comeco: "Começo e fim",
  equipe: "Chamar a equipe",
  publicacao: "Publicação",
};

const TAB_LABEL: Record<string, string> = {
  materiais: "Materiais",
  calendario: "Calendário",
  dados: "Dados do cliente e da empresa",
  prontas: "Mensagens prontas e catálogo",
  assuntos: "Assuntos",
  acoes: "O que ele pode fazer",
  atalhos: "Atalhos automáticos",
  escopo: "Fora do escopo",
};

function withLabel(t: Omit<ValidationTarget, "label">, extra?: string): ValidationTarget {
  const parts = [SECTION_LABEL[t.section] ?? t.section, t.tab ? TAB_LABEL[t.tab] : undefined, extra].filter(Boolean);
  return { ...t, label: parts.join(" › ") };
}

/** Seção/aba da tela (e assunto, quando houver) onde o campo do achado se corrige. */
export function pathTarget(path: string, config: Record<string, unknown> | null | undefined): ValidationTarget {
  const head = path.split(/[.[]/)[0] ?? "";
  const theme = /^themes\[(\d+)\]/.exec(path);
  if (theme) {
    const list = Array.isArray(config?.themes) ? (config!.themes as Array<{ id?: string; name?: string }>) : [];
    const t = list[Number(theme[1])];
    return withLabel({ section: "cuida", tab: "assuntos", themeId: t?.id }, t?.name ? `“${t.name}”` : undefined);
  }
  switch (head) {
    case "rules":
      return withLabel({ section: "cuida", tab: "atalhos" });
    case "scope":
      return withLabel({ section: "cuida", tab: "escopo" });
    case "actionOptions":
    case "enabledTools":
    case "toolGovernor":
      return withLabel({ section: "cuida", tab: "acoes" });
    case "handoff":
    case "businessHours":
    case "systemMessages":
    case "fallback":
    case "limits":
    case "sentiment":
      return withLabel({ section: "equipe" });
    case "entry":
    case "media":
    case "closure":
    case "inactivity":
    case "tabulation":
    case "survey":
    case "onboarding":
      return withLabel({ section: "comeco" });
    case "calendar":
      return withLabel({ section: "sabe", tab: "calendario" });
    case "variables":
    case "contextFields":
    case "derivedFields":
    case "dealSelection":
      return withLabel({ section: "sabe", tab: "dados" });
    case "allowedKnowledgeDocIds":
    case "knowledgeSearch":
    case "groundingCheck":
      return withLabel({ section: "sabe", tab: "materiais" });
    case "allowedMessageModelIds":
    case "allowedFlowIds":
    case "productPolicy":
    case "messageModelMode":
    case "messageModelAdapt":
      return withLabel({ section: "sabe", tab: "prontas" });
    case "channelIds":
    case "allowedPhoneNumbers":
    case "model":
    case "autonomyMode":
      return withLabel({ section: "publicacao" });
    case "name":
    case "tone":
    case "globalRules":
    case "allowedDomains":
    case "responseLength":
    case "emojis":
    case "bold":
      return withLabel({ section: "quem" });
    default:
      return withLabel({ section: "inicio" });
  }
}
