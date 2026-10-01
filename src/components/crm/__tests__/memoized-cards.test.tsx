import { describe, expect, it } from "vitest";

import { ConversationCard } from "../conversation-card";
import { DealCard } from "../deal-card";
import { KanbanColumn } from "../kanban-column";
import { MessageBubble } from "../message-bubble";

/**
 * Sem DOM no vitest (env node, sem jsdom) não dá para contar renders;
 * garantimos aqui que as exportações são `React.memo` — quem consome
 * com props estáveis (ver `ConversationRow`, `BoardDealCard`,
 * `DefaultDealItem`) ganha o bail-out do React por comparação rasa.
 */
const REACT_MEMO = Symbol.for("react.memo");

type MemoLike = { $$typeof?: symbol; type?: unknown; compare?: unknown };

function asMemo(component: unknown): MemoLike {
  return component as MemoLike;
}

describe("componentes de lista memoizados (FE-1/FE-2)", () => {
  it.each([
    ["DealCard", DealCard],
    ["KanbanColumn", KanbanColumn],
    ["ConversationCard", ConversationCard],
    ["MessageBubble", MessageBubble],
  ])("%s é React.memo com comparação rasa padrão", (_name, component) => {
    const m = asMemo(component);
    expect(m.$$typeof).toBe(REACT_MEMO);
    expect(typeof m.type).toBe("function");
    // Sem comparador custom: React compara cada prop com Object.is.
    expect(m.compare ?? null).toBeNull();
  });
});
