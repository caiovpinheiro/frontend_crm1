import type { InboxTab } from "./api/types";

export type InboxQueueGroupId =
  | "pin"
  | "action"
  | "serving"
  | "automation"
  | "done"
  | "attention";

export type InboxQueueItem = {
  id: InboxTab;
  label: string;
  description: string;
  title?: string;
  group: InboxQueueGroupId;
  groupLabel: string | null;
  groupTone: string;
};

export const INBOX_QUEUE_ITEMS: readonly InboxQueueItem[] = [
  {
    id: "todos",
    label: "Todas as conversas",
    description: "Visão completa de todas as filas",
    group: "pin",
    groupLabel: null,
    groupTone: "",
  },
  {
    id: "entrada",
    label: "Entrada",
    description: "Novas conversas não assumidas",
    group: "action",
    groupLabel: "Precisa de ação",
    groupTone: "text-[var(--color-warning)]",
  },
  {
    id: "esperando",
    label: "Cliente respondeu",
    description: "Cliente está aguardando resposta",
    group: "action",
    groupLabel: "Precisa de ação",
    groupTone: "text-[var(--color-warning)]",
  },
  {
    id: "ligar",
    label: "Ligação autorizada",
    description: "Cliente autorizou contato",
    title: "WhatsApp com permissão de ligação ativa",
    group: "action",
    groupLabel: "Precisa de ação",
    groupTone: "text-[var(--color-warning)]",
  },
  {
    id: "respondidas",
    label: "Em atendimento",
    description: "Já respondidas pelo operador",
    group: "serving",
    groupLabel: "Em atendimento",
    groupTone: "text-[var(--color-lavender)]",
  },
  {
    id: "resolvidos",
    label: "Resolvendo",
    description: "Em acompanhamento — aberta, sem automação",
    group: "serving",
    groupLabel: "Em atendimento",
    groupTone: "text-[var(--color-lavender)]",
  },
  {
    id: "agente_ia",
    label: "Agente IA",
    description: "Atendimento pelo agente de IA",
    title: "Conversas em atendimento pelo Agente IA",
    group: "automation",
    groupLabel: "Automação",
    groupTone: "text-[var(--color-chip-violet)]",
  },
  {
    id: "automacao",
    label: "Automação",
    description: "Chatbot ou automação em execução",
    group: "automation",
    groupLabel: "Automação",
    groupTone: "text-[var(--color-chip-violet)]",
  },
  {
    id: "finalizados",
    label: "Encerradas",
    description: "Conversas finalizadas",
    group: "done",
    groupLabel: "Finalizadas",
    groupTone: "text-[var(--color-success)]",
  },
  {
    id: "erro",
    label: "Erro",
    description: "Conversas com problemas",
    group: "attention",
    groupLabel: "Atenção",
    groupTone: "text-[var(--color-danger)]",
  },
];
