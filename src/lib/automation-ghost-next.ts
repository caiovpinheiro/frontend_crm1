/**
 * `nextStepId` raiz em nós que roteiam por handles (lista/botões/pergunta)
 * ou que encerram o fluxo. O canvas não desenha essa aresta, mas o
 * executor ainda pode segui-la — o cliente escolhe uma opção e o menu
 * reaparece, ou a conversa fecha e o fluxo continua.
 */

export const NONE_STEP_ID = "__none__";

const NO_ROOT_NEXT_TYPES = new Set([
  "condition",
  "round_robin",
  "wait_for_reply",
  "question",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "finish",
  "stop_automation",
  "transfer_automation",
  "finish_conversation",
  "goto",
]);

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function readNextId(config: unknown): string {
  const raw = asRecord(config).nextStepId;
  return typeof raw === "string" ? raw.trim() : "";
}

function choiceItems(type: string, cfg: Record<string, unknown>): Record<string, unknown>[] {
  const key = type === "send_whatsapp_list" ? "rows" : "buttons";
  return Array.isArray(cfg[key]) ? (cfg[key] as Record<string, unknown>[]) : [];
}

function itemHasGoto(item: Record<string, unknown>): boolean {
  const id = typeof item.gotoStepId === "string" ? item.gotoStepId.trim() : "";
  return id.length > 0 && id !== NONE_STEP_ID;
}

/** Tipos cujo destino sai só pelos handles — não pelo `nextStepId` raiz. */
export function stepUsesRootNextStepId(type: string): boolean {
  if (NO_ROOT_NEXT_TYPES.has(type)) return false;
  return true;
}

/**
 * `nextStepId` que o editor não mostra e que o runtime não deveria
 * seguir: menu/pergunta com todas as opções já ligadas, ou passo que
 * encerra conversa/automação.
 */
export function shouldClearGhostRootNext(type: string, config: unknown): boolean {
  const next = readNextId(config);
  if (!next || next === NONE_STEP_ID) return false;

  if (
    type === "finish" ||
    type === "stop_automation" ||
    type === "transfer_automation" ||
    type === "finish_conversation"
  ) {
    return true;
  }

  if (type === "tabulate_conversation") {
    return asRecord(config).closeConversation !== false;
  }

  if (
    type === "question" ||
    type === "send_whatsapp_interactive" ||
    type === "send_whatsapp_list"
  ) {
    const items = choiceItems(type, asRecord(config));
    return items.length > 0 && items.every(itemHasGoto);
  }

  return false;
}

export function clearGhostRootNext<T extends { type: string; config: unknown }>(
  steps: T[],
): { steps: T[]; changed: boolean } {
  let changed = false;
  const next = steps.map((step) => {
    if (!shouldClearGhostRootNext(step.type, step.config)) return step;
    changed = true;
    return {
      ...step,
      config: { ...asRecord(step.config), nextStepId: NONE_STEP_ID },
    };
  });
  return { steps: next, changed };
}

/**
 * Primeira abertura de automação antiga (sem `__hasExplicitEdges`):
 * só inventa `nextStepId` linear em passos que realmente usam essa chave.
 */
export function migrateLegacyLinearNext<T extends { id: string; type: string; config: unknown }>(
  steps: T[],
): T[] {
  return steps.map((step, i) => {
    const cfg = { ...asRecord(step.config) };
    if (stepUsesRootNextStepId(step.type)) {
      const following = steps[i + 1];
      cfg.nextStepId = following ? following.id : NONE_STEP_ID;
    }
    cfg.__hasExplicitEdges = true;
    return { ...step, config: cfg };
  });
}

export function needsLegacyLinearMigration(
  steps: Array<{ config: unknown }>,
): boolean {
  return !steps.some((s) => asRecord(s.config).__hasExplicitEdges === true);
}
