/**
 * Espelho do contrato de `inboxPolicy.messageRules` (backend
 * `src/lib/ai-agents/message-rules.ts`). O backend é a fonte da verdade:
 * aqui só ficam tipo, rótulos de operador e normalização de leitura.
 */

export type MessageRuleAction =
  | "answer_with_knowledge"
  | "transfer_department"
  | "transfer_human"
  | "fixed_reply"
  | "add_tag";

export const MESSAGE_RULE_ACTIONS: MessageRuleAction[] = [
  "answer_with_knowledge",
  "transfer_department",
  "transfer_human",
  "fixed_reply",
  "add_tag",
];

export type MessageRule = {
  id: string;
  label: string;
  enabled: boolean;
  anyOf: string[];
  allOf: string[];
  noneOf: string[];
  action: MessageRuleAction;
  department: string | null;
  message: string | null;
  /// Só em `add_tag`: nome da tag, exatamente como está no CRM.
  tagName: string | null;
};

/** Rótulos em linguagem de operador — nunca o nome técnico. */
export const MESSAGE_RULE_ACTION_LABELS: Record<
  MessageRuleAction,
  { label: string; hint: string }
> = {
  answer_with_knowledge: {
    label: "Deixar o agente responder usando a base de conhecimento",
    hint: "O agente responde com os documentos da base, sem transferir.",
  },
  transfer_department: {
    label: "Transferir para um departamento",
    hint: "A conversa vai para a fila do departamento escolhido.",
  },
  transfer_human: {
    label: "Transferir para a fila de atendimento humano",
    hint: "Sem escolher departamento — entra na fila geral.",
  },
  fixed_reply: {
    label: "Responder com um texto fixo",
    hint: "O agente envia exatamente o texto escrito, sem chamar o modelo.",
  },
  add_tag: {
    label: "Marcar uma tag no contato",
    hint: "Dispara as automações com gatilho 'Tag adicionada'. A tag precisa já existir no CRM.",
  },
};

function termList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const raw of v) {
    if (typeof raw !== "string") continue;
    const s = raw.trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isAction(v: unknown): v is MessageRuleAction {
  return (
    typeof v === "string" &&
    MESSAGE_RULE_ACTIONS.includes(v as MessageRuleAction)
  );
}

export function normalizeMessageRules(v: unknown): MessageRule[] {
  if (!Array.isArray(v)) return [];
  const out: MessageRule[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    if (!isAction(r.action)) continue;
    const id = text(r.id) ?? `regra-${out.length + 1}`;
    if (out.some((e) => e.id === id)) continue;
    out.push({
      id,
      label: text(r.label) ?? id,
      enabled: r.enabled !== false,
      anyOf: termList(r.anyOf),
      allOf: termList(r.allOf),
      noneOf: termList(r.noneOf),
      action: r.action,
      department: text(r.department),
      message: text(r.message),
      tagName: text(r.tagName),
    });
  }
  return out;
}

/** Id novo, estável o suficiente para lista reordenável. */
export function newMessageRuleId(): string {
  return `regra-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}

export function emptyMessageRule(): MessageRule {
  return {
    id: newMessageRuleId(),
    label: "",
    enabled: true,
    anyOf: [],
    allOf: [],
    noneOf: [],
    action: "answer_with_knowledge",
    department: null,
    message: null,
    tagName: null,
  };
}
