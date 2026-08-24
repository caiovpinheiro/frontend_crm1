import {
  formatHumanEventActorName,
  isGenericHumanEventActor,
} from "./event-actor";
import type {
  ClassifiedTimelineItem,
  ConversationEventAction,
  TimelineClassifyInput,
} from "./types";

const EVENT_TYPE_PREFIX = "event:";

const SYSTEM_ACTORS = new Set([
  "agente ia",
  "sistema",
  "automação",
  "automacao",
]);

const DRAFT_TYPES = new Set(["ai_draft"]);

export function isEventMessageType(
  messageType: string | null | undefined,
): boolean {
  if (!messageType) return false;
  const mt = messageType.toLowerCase();
  return mt === "event" || mt.startsWith(EVENT_TYPE_PREFIX);
}

export function parseEventActionFromMessageType(
  messageType: string | null | undefined,
): ConversationEventAction | undefined {
  if (!messageType) return undefined;
  const mt = messageType.toLowerCase();
  if (!mt.startsWith(EVENT_TYPE_PREFIX)) return undefined;
  const raw = mt.slice(EVENT_TYPE_PREFIX.length);
  return isConversationEventAction(raw) ? raw : undefined;
}

export function isConversationEventAction(
  value: string,
): value is ConversationEventAction {
  return (
    value === "distribuicao" ||
    value === "atribuicao" ||
    value === "transferencia" ||
    value === "status" ||
    value === "tabulacao" ||
    value === "tag" ||
    value === "entrada" ||
    value === "saida" ||
    value === "ia" ||
    value === "template"
  );
}

function normalizeActor(name: string | null | undefined): string {
  return (name ?? "").trim().toLowerCase();
}

function isSystemActor(input: TimelineClassifyInput): boolean {
  const author = (input.authorType ?? "").toLowerCase();
  if (author === "system" || author === "bot") return true;
  return SYSTEM_ACTORS.has(normalizeActor(input.senderName));
}

/** Encurta eventos de fila legados no display (texto já persistido). */
export function normalizeQueueEventText(text: string): string {
  let t = text
    .replace(/\s*\([A-Z][A-Z0-9]*(_[A-Z0-9]+)+\)/g, "")
    .replace(/\s+[A-Z][A-Z0-9]*(_[A-Z0-9]+)+(?=\s|$)/g, "")
    .replace(/^Conversa enfileirada para\s+/i, "Enfileirada em ")
    .replace(/aguardando consultor elegível/gi, "sem consultor elegível")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+[—–-]\s*$/g, "")
    .trim();
  if (/^aguardando consultor/i.test(t) || /^sem consultor elegível$/i.test(t)) {
    return "Enfileirada — sem consultor elegível";
  }
  return t;
}

const LEAVE_EVENT_RE = /^(.+?)\s+(saiu|entrou|removida)\s+da conversa$/i;

const LIFECYCLE_OPEN_RE = /^Conversa(?:\s+#\d+)?\s+aberta$/i;
const LIFECYCLE_CLOSE_RE = /^Conversa(?:\s+#\d+)?\s+encerrada$/i;
const LEGACY_CLOSE_STATUS_RE = /^Status alterado para Encerrada$/i;
const LEGACY_OPEN_STATUS_RE = /^Status alterado para (?:Em atendimento|Aberta)$/i;

/** Status "Encerrada"/"Aberta" legado — o evento de conversa já cobre. */
export function isRedundantOpenStatusEvent(
  text: string | null | undefined,
): boolean {
  return LEGACY_OPEN_STATUS_RE.test((text ?? "").trim());
}

export function isConversationCloseEventText(
  text: string | null | undefined,
): boolean {
  const t = (text ?? "").trim();
  return LIFECYCLE_CLOSE_RE.test(t) || LEGACY_CLOSE_STATUS_RE.test(t);
}

export function isConversationOpenEventText(
  text: string | null | undefined,
  number?: number | null,
): boolean {
  const t = (text ?? "").trim();
  if (typeof number === "number" && number > 0) {
    return new RegExp(`^Conversa\\s+#${number}\\s+aberta`, "i").test(t);
  }
  return LIFECYCLE_OPEN_RE.test(t) || /^Conversa\s+#\d+\s+aberta/i.test(t);
}

export function isConversationLifecycleText(
  text: string | null | undefined,
): boolean {
  const t = (text ?? "").trim();
  return LIFECYCLE_OPEN_RE.test(t) || LIFECYCLE_CLOSE_RE.test(t);
}

/** Atribuição / transferência / remoção: o ator é quem fez, não o sujeito. */
export function isConversationActorAsAuthorText(
  text: string | null | undefined,
): boolean {
  const t = (text ?? "").trim();
  if (isConversationLifecycleText(t)) return true;
  if (/^Atribuída a /i.test(t)) return true;
  if (/^Transferida /i.test(t)) return true;
  // "Conversa distribuída para Atendimento → Larissa · Agente IA" era lido
  // como se o destino fosse a IA. Com "por" fica claro que o Agente IA é
  // quem distribuiu, e o destino continua sendo o consultor.
  if (/^Conversa distribuída/i.test(t)) return true;
  if (/removida da conversa$/i.test(t)) return true;
  return false;
}

/** Esconde "· Joyce" quando o texto já é "Joyce entrou/saiu da conversa". */
export function eventActorIsSubject(
  text: string,
  actor?: string | null,
): boolean {
  if (!actor?.trim()) return false;
  const m = text.trim().match(LEAVE_EVENT_RE);
  if (!m) return false;
  const verb = m[2].toLowerCase();
  if (verb === "removida") return false;
  const who = formatHumanEventActorName(m[1]) || m[1].trim();
  const actorShort = formatHumanEventActorName(actor) || actor.trim();
  return who.toLowerCase() === actorShort.toLowerCase();
}

/**
 * Encurta o nome no texto e, se o ator não for a pessoa do texto,
 * troca "saiu" por "removida" (A removeu B).
 */
export function normalizeConversationEventText(
  text: string,
  actor?: string | null,
): string {
  const queued = normalizeQueueEventText(text);
  if (LEGACY_CLOSE_STATUS_RE.test(queued)) return "Conversa encerrada";
  const m = queued.match(LEAVE_EVENT_RE);
  if (!m) return queued;
  const who = formatHumanEventActorName(m[1]) || m[1].trim();
  const verb = m[2].toLowerCase();
  if (verb === "entrou") return `${who} entrou na conversa`;
  if (verb === "removida") return `${who} removida da conversa`;
  const actorShort = formatHumanEventActorName(actor);
  const actorNorm = (actorShort || actor || "").trim().toLowerCase();
  if (
    actorNorm &&
    actorNorm !== who.toLowerCase() &&
    !isGenericHumanEventActor(actor)
  ) {
    return `${who} removida da conversa`;
  }
  return `${who} saiu da conversa`;
}

export function inferEventActionFromText(
  content: string | null | undefined,
): ConversationEventAction {
  const t = (content ?? "").toLowerCase();
  if (/conversa(?:\s+#\d+)?\s+aberta/.test(t)) return "entrada";
  if (
    /conversa(?:\s+#\d+)?\s+encerrada/.test(t) ||
    /status alterado para encerrada/.test(t)
  ) {
    return "saida";
  }
  if (/^atribu[ií]d/.test(t)) return "atribuicao";
  if (
    /distribu[ií]d|enfileirad/.test(t)
  ) {
    return "distribuicao";
  }
  if (/transfer/.test(t)) return "transferencia";
  if (/tabulad/.test(t)) return "tabulacao";
  if (
    /status|reabert|resolvid/.test(t)
  ) {
    return "status";
  }
  if (/\btags?\b/.test(t)) return "tag";
  if (/entrou|entrada/.test(t)) return "entrada";
  if (/saiu|sa[ií]da|removid/.test(t)) return "saida";
  if (/iniciada por template/.test(t)) return "template";
  return "ia";
}

/**
 * Separa ITEM da timeline do chat:
 *   - event  = log automático (sistema / agente IA), inclusive legado
 *              gravado como nota (`messageType=note` + autor sistema/IA)
 *   - note   = anotação manual humana
 *   - message = o restante
 */
export function classifyTimelineItem(
  input: TimelineClassifyInput,
): ClassifiedTimelineItem {
  const mt = (input.messageType ?? "").toLowerCase();
  if (
    DRAFT_TYPES.has(mt) ||
    mt === "ticket-separator" ||
    mt === "sip_call" ||
    mt === "whatsapp_call" ||
    mt === "whatsapp_call_recording"
  ) {
    return { kind: "message" };
  }

  if (isEventMessageType(mt)) {
    const inferred = inferEventActionFromText(input.content);
    return {
      kind: "event",
      // Legado: tabulação era gravada como event:status;
      // abrir/encerrar gravados como event:status viram entrada/saida.
      action:
        inferred === "tabulacao"
          ? "tabulacao"
          : inferred === "entrada" || inferred === "saida"
            ? inferred
            : parseEventActionFromMessageType(mt) ?? inferred,
    };
  }

  const isPrivate =
    input.isPrivate === true ||
    input.private === true ||
    mt === "note";

  if (isPrivate && isSystemActor(input)) {
    return {
      kind: "event",
      action: inferEventActionFromText(input.content),
    };
  }

  if (isPrivate) {
    return { kind: "note" };
  }

  return { kind: "message" };
}
