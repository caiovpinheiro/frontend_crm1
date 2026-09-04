import type { ConversationListRow, InboxTab, TabCounts } from "./api";

function normalizeMessageDirection(
  raw: string | null | undefined,
): "in" | "out" | null {
  const v = String(raw ?? "").toLowerCase();
  if (v === "in" || v === "inbound") return "in";
  if (v === "out" || v === "outbound") return "out";
  return null;
}

function lastMessageDirection(row: ConversationListRow): "in" | "out" | null {
  // Coluna denormalizada = mesmo predicado do backend (`tabToWhere`).
  // Preview/lastMessage são fallback quando o card ainda não hidratou a coluna.
  return (
    normalizeMessageDirection(row.lastMessageDirection) ??
    normalizeMessageDirection(row.lastMessage?.direction) ??
    normalizeMessageDirection(row.lastMessagePreview?.direction)
  );
}

/** Espelha `countableReplyWhere(false)` — setting ON não chega no card; se
 *  `hasAgentReply` vier true tratamos como reply contável (seguro p/ abas). */
function hasCountableReply(row: ConversationListRow): boolean | null {
  if (row.hasHumanReply === true || row.hasAgentReply === true) return true;
  if (row.hasHumanReply === false) return false;
  return null;
}

/**
 * Fila canônica da conversa (a mais específica). Usado ao abrir um hit
 * da busca para mudar a aba da inbox junto com o ticket.
 *
 * Encerradas = conversa de fato fechada (`RESOLVED` / `closedAt`).
 * Resolvendo = `followUpAt` (Acompanhar; ticket continua OPEN).
 * Deal GANHO/PERDIDO com ticket ainda OPEN fica na aba que o status
 * implica (Aguardando, Entrada, …) — estágio do funil não fecha conversa.
 */
export function inboxQueueTabFor(row: ConversationListRow): InboxTab {
  if (row.followUpAt) return "resolvidos";
  if (row.status === "RESOLVED" || row.closedAt) return "finalizados";
  if (row.hasError) return "erro";

  const assigneeType = (row.assignedTo?.type ?? "").toUpperCase();

  // Responsável IA tem fila própria (`agente_ia`), tenha o aluno respondido
  // ou não — espelha `tabToWhere` no backend.
  if (assigneeType === "AI") return "agente_ia";
  if (!row.assignedToId) return "entrada";

  // Entrada (backend): assignee HUMANO ainda sem reply contável — o cliente
  // pode ter falado por último (`lastMessageDirection=in`) sem ser Aguardando.
  const countable = hasCountableReply(row);
  if (countable === false) return "entrada";

  const dir = lastMessageDirection(row);
  if (dir === "in") return "esperando";
  if (dir === "out") return "respondidas";
  return "entrada";
}

/**
 * A conversa cabe nesta aba da inbox? Usado pelo SSE para mover o card
 * entre caches sem refetch da lista. `ligar` e `todos`/`abertas` são
 * sobreposições (o ticket também vive na fila canônica).
 *
 * Automação não dá pra afirmar pelo row (falta contexto RUNNING) — ver
 * `rowStaysOnAutomacaoTab`.
 */
export function rowBelongsToInboxTab(
  row: ConversationListRow,
  tab: InboxTab,
): boolean {
  const resolved = row.status === "RESOLVED" || Boolean(row.closedAt);
  if (tab === "resolvidos") return Boolean(row.followUpAt);
  if (tab === "finalizados") return resolved && !row.followUpAt;
  if (resolved) return tab === "todos";

  if (tab === "todos") return true;
  if (tab === "abertas") return !row.hasError;
  if (tab === "erro") return Boolean(row.hasError);
  if (row.hasError) return false;

  if (tab === "ligar") {
    return row.channel === "whatsapp" && row.whatsappCallConsentStatus === "GRANTED";
  }
  if (tab === "automacao") return false;

  const canonical = inboxQueueTabFor(row);
  if (tab === "entrada") {
    if (canonical !== "entrada") return false;
    // Sem dono e sem inbound = órfão/robô — não é Entrada (tabToWhere).
    if (!row.assignedToId && !row.lastInboundAt) return false;
    return true;
  }
  if (tab === "esperando" || tab === "respondidas") {
    // Sem sinal de reply contável, não afirme Aguardando/Respondidas
    // (evita roubar Entrada quando a API ainda não manda hasHumanReply).
    if (hasCountableReply(row) === false) return false;
  }
  return canonical === tab;
}

/** A fila canônica mudou (esperando↔respondidas, entrada→…). */
export function tabMoved(
  from: ConversationListRow | InboxTab | null | undefined,
  to: ConversationListRow | InboxTab | null | undefined,
): boolean {
  const a = from == null ? null : typeof from === "string" ? from : inboxQueueTabFor(from);
  const b = to == null ? null : typeof to === "string" ? to : inboxQueueTabFor(to);
  return a !== b;
}

function clampTabCount(n: number): number {
  return n < 0 ? 0 : n;
}

/**
 * ±1 no badge da fila canônica. `todos` / `abertas` / overlays só
 * mudam quando a conversa entra ou sai do conjunto (novo card / some).
 * Aceita drift até o próximo GET `?counts=1` (troca de aba/filtro/refresh).
 */
export function applyTabCountMove(
  counts: TabCounts,
  from: InboxTab | null | undefined,
  to: InboxTab | null | undefined,
): TabCounts {
  if (!tabMoved(from, to)) return counts;
  const next = { ...counts };
  if (from && from in next) {
    next[from] = clampTabCount((next[from] ?? 0) - 1);
  }
  if (to && to in next) {
    next[to] = (next[to] ?? 0) + 1;
  }
  const fromClosed = from === "finalizados";
  const toClosed = to === "finalizados";
  if (from && !to) {
    next.todos = clampTabCount((next.todos ?? 0) - 1);
    if (!fromClosed) next.abertas = clampTabCount((next.abertas ?? 0) - 1);
  } else if (!from && to) {
    next.todos = (next.todos ?? 0) + 1;
    if (!toClosed) next.abertas = (next.abertas ?? 0) + 1;
  } else if (fromClosed !== toClosed) {
    if (toClosed) next.abertas = clampTabCount((next.abertas ?? 0) - 1);
    else next.abertas = (next.abertas ?? 0) + 1;
  }
  return next;
}

/** Card já listado em Automação permanece até haver dono, inbound ou encerrar. */
export function rowStaysOnAutomacaoTab(row: ConversationListRow): boolean {
  if (row.status === "RESOLVED" || row.closedAt || row.hasError) return false;
  if (row.assignedToId || row.lastInboundAt) return false;
  return true;
}

export function pickVisibleInboxTab(
  preferred: InboxTab,
  visible: readonly { id: InboxTab }[],
): InboxTab | null {
  if (visible.some((t) => t.id === preferred)) return preferred;
  if (visible.some((t) => t.id === "todos")) return "todos";
  return visible[0]?.id ?? null;
}

/** A conversa cabe em alguma das filas selecionadas (união). */
export function rowBelongsToAnyInboxTab(
  row: ConversationListRow,
  tabs: readonly InboxTab[],
): boolean {
  if (tabs.length === 0) return false;
  if (tabs.includes("todos")) return rowBelongsToInboxTab(row, "todos");
  return tabs.some((tab) => rowBelongsToInboxTab(row, tab));
}

/**
 * Ordem de claim exclusivo nas seções multi-fila.
 * `ligar` é overlay: quando selecionada, fica na frente para não ser
 * absorvida por Entrada/Aguardando (mesmo ticket conta nas duas abas no BE).
 */
export const INBOX_QUEUE_SECTION_ORDER: readonly InboxTab[] = [
  "ligar",
  "entrada",
  "esperando",
  "respondidas",
  "resolvidos",
  "agente_ia",
  "automacao",
  "finalizados",
  "erro",
];

export function inboxQueueSectionPriority(tab: InboxTab | null | undefined): number {
  if (!tab) return 999;
  const i = INBOX_QUEUE_SECTION_ORDER.indexOf(tab);
  return i < 0 ? 500 : i;
}

/**
 * Em qual seção da lista o card entra quando várias filas (ou Todas)
 * estão visíveis. Prefere `row.queueTab` (tag do fetch por aba); senão
 * claim exclusivo na ordem de `INBOX_QUEUE_SECTION_ORDER`.
 */
export function inboxQueueSectionFor(
  row: ConversationListRow,
  selected: readonly InboxTab[],
): InboxTab {
  const specific = selected.filter((t) => t !== "todos" && t !== "abertas");
  const pool = specific.length > 0 ? specific : INBOX_QUEUE_SECTION_ORDER;

  if (row.queueTab && pool.includes(row.queueTab)) return row.queueTab;

  for (const tab of INBOX_QUEUE_SECTION_ORDER) {
    if (!pool.includes(tab)) continue;
    if (rowBelongsToInboxTab(row, tab)) return tab;
  }
  return inboxQueueTabFor(row);
}
