import {
  formatHumanEventActorName,
  isGenericHumanEventActor,
} from "./event-actor";
import type {
  ClassifiedTimelineItem,
  ConsentVerdict,
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
 * Resposta do cliente ao pedido de permissão de ligação (Meta Calling
 * API — `call_permission_reply`), gravada pelo webhook. Texto curto;
 * o limite evita falso-positivo em mensagem longa que contenha
 * "aceitou"/"recusou".
 */
export function detectConsentVerdict(
  content: string | null | undefined,
): ConsentVerdict | null {
  if (!content) return null;
  const t = content.toLowerCase().trim();
  if (!t || t.length > 120) return null;

  const isAccept =
    t.includes("cliente aceitou") ||
    t.includes("permissão para ligações concedida") ||
    t.includes("permissao para ligacoes concedida");
  const isDeny =
    t.includes("cliente recusou") ||
    /\breject(ed)?\b/.test(t) ||
    /\bdecline(d)?\b/.test(t);
  const isPermanent = t.includes("permanente") || t.includes("permanent");

  if (isDeny && !isAccept) return "denied";
  if (isAccept) return isPermanent ? "granted_perm" : "granted_temp";

  // Cabeçalhos genéricos que o webhook grava quando não classifica.
  if (t.startsWith("📞 resposta ao pedido de ligações")) return "unknown";
  if (t.startsWith("📞 resposta ao pedido de permissão")) return "unknown";
  if (t.startsWith("📞 permissão de ligação")) return "unknown";
  return null;
}

/**
 * Evento de sistema da API Meta (webhook `type: "system"`, ex.:
 * `user_changed_number`). Versões antigas gravavam só "[system]"; as
 * novas trazem o aviso da Meta no `content`. O separador de ticket
 * também tem `direction: "system"`, mas é tratado antes pelo `messageType`.
 */
export function isMetaSystemEventItem(input: {
  direction?: string | null;
  messageType?: string | null;
  content?: string | null;
}): boolean {
  const mt = (input.messageType ?? "").toLowerCase();
  if (mt === "ticket-separator" || isEventMessageType(mt) || mt === "note") {
    return false;
  }
  const raw = (input.content ?? "").trim();
  if ((input.direction ?? "").toLowerCase() === "system") return true;
  if (raw === "[system]" || raw === "[Sistema]") return true;
  return mt === "system" && raw.startsWith("[Sistema");
}

/**
 * Separa ITEM da timeline do chat:
 *   - event  = log automático (sistema / agente IA), inclusive legado
 *              gravado como nota (`messageType=note` + autor sistema/IA)
 *   - note   = anotação manual humana
 *   - system = evento de sistema da Meta (troca de número etc.)
 *   - consent = resposta ao pedido de permissão de ligação
 *   - draft  = rascunho de agente IA (`ai_draft`) aguardando aprovação
 *   - message = o restante
 */
export function classifyTimelineItem(
  input: TimelineClassifyInput,
): ClassifiedTimelineItem {
  const mt = (input.messageType ?? "").toLowerCase();
  // Rascunho de agente IA (modo DRAFT): card com aprovar/editar/descartar
  // no lugar da bolha — o canônico não pode ficar cego para ele.
  if (DRAFT_TYPES.has(mt)) {
    return { kind: "draft" };
  }
  if (
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

  if (!isPrivate) {
    if (isMetaSystemEventItem(input)) return { kind: "system" };
    // Consentimento vem do cliente/webhook — texto OUT do agente
    // ("Cliente recusou a proposta") nunca vira card de permissão.
    if ((input.direction ?? "").toLowerCase() !== "out") {
      const verdict = detectConsentVerdict(input.content);
      if (verdict) return { kind: "consent", consentVerdict: verdict };
    }
  }

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
