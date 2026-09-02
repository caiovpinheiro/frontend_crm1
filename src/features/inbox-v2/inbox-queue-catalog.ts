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

export type InboxQueueCounts = Readonly<Partial<Record<string, number>>>;

function catalogSelected(
  selectedIds: readonly string[],
  items: readonly InboxQueueItem[] = INBOX_QUEUE_ITEMS,
): InboxQueueItem[] {
  return items.filter((item) => selectedIds.includes(item.id));
}

/** Rótulo do gatilho: 1 = nome; 2 = "0 + 3"; 3+ = "4 filas". */
export function inboxQueueTriggerLabel(
  selectedIds: readonly string[],
  items: readonly InboxQueueItem[] = INBOX_QUEUE_ITEMS,
  counts?: InboxQueueCounts,
): string {
  const selected = catalogSelected(selectedIds, items);
  if (selected.length === 0) return "Filas";
  if (selected.length === 1) return selected[0]?.label ?? "Filas";
  if (selected.length === 2) {
    const parts = selected.map((item) => counts?.[item.id]);
    if (parts.every((n): n is number => typeof n === "number")) {
      return `${parts[0]} + ${parts[1]}`;
    }
  }
  return `${selected.length} filas`;
}

/** Soma das contagens das filas do catálogo (badge / select-all). */
export function inboxQueueSelectedCount(
  selectedIds: readonly string[],
  counts?: InboxQueueCounts | null,
  items: readonly InboxQueueItem[] = INBOX_QUEUE_ITEMS,
): number | undefined {
  const selected = catalogSelected(selectedIds, items);
  if (selected.length === 0 || !counts) return undefined;
  let sum = 0;
  for (const item of selected) {
    const n = counts[item.id];
    if (typeof n !== "number") return undefined;
    sum += n;
  }
  return sum;
}
