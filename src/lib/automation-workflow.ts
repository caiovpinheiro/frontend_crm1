import {
  looksLikeOpaqueId,
  newBranchId,
  summarizeConditionConfig,
  type ConditionConfig,
} from "@/lib/automation-condition";
import {
  newRoundRobinOptionId,
  summarizeRoundRobinConfig,
  type RoundRobinConfig,
} from "@/lib/automation-round-robin";

export type AutomationTriggerType =
  | "stage_changed"
  | "tag_added"
  | "lead_score_reached"
  | "deal_created"
  | "deal_won"
  | "deal_lost"
  | "contact_created"
  | "conversation_created"
  | "lifecycle_changed"
  | "agent_changed"
  | "message_received"
  | "message_sent"
  | "call_received"
  | "call_made"
  | "call_permission_granted"
  | "conversation_tabulated"
  | "whatsapp_session_expiring"
  | "lead_distributed"
  | "manual";

export type AutomationStep = {
  id: string;
  type: string;
  config: Record<string, unknown>;
};

export const AUTOMATION_TRIGGER_TYPES: AutomationTriggerType[] = [
  "stage_changed",
  "tag_added",
  "lead_score_reached",
  "deal_created",
  "deal_won",
  "deal_lost",
  "contact_created",
  "conversation_created",
  "lifecycle_changed",
  "agent_changed",
  "message_received",
  "message_sent",
  "call_received",
  "call_made",
  "call_permission_granted",
  "conversation_tabulated",
  "whatsapp_session_expiring",
  "lead_distributed",
  "manual",
];

export const ACTION_STEP_TYPES = [
  "send_email",
  "move_stage",
  "mark_deal_won",
  "mark_deal_lost",
  "assign_owner",
  "transfer_department",
  "add_tag",
  "remove_tag",
  "update_field",
  "create_activity",
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_whatsapp_flow",
  "webhook",
  "delay",
  "condition",
  "round_robin",
  "update_lead_score",
  "question",
  "wait_for_reply",
  "set_variable",
  "goto",
  "transfer_automation",
  "stop_automation",
  "finish",
  "create_deal",
  "finish_conversation",
  "tabulate_conversation",
  "business_hours",
  "check_agent_status",
  "ask_ai_agent",
  "transfer_to_ai_agent",
  "consume_stock",
  "execute_distribution",
  "send_product",
] as const;

export type ActionStepType = (typeof ACTION_STEP_TYPES)[number];

/**
 * Steps de "mensagem" que suportam seleção de canal (`config.channelId`).
 * `question` está incluído porque envia via WhatsApp/Meta (pergunta ao
 * lead) — mesmo picker/regra de herança dos demais envios WA.
 */
export const MESSAGE_CHANNEL_STEP_TYPES = [
  "send_whatsapp_message",
  "send_whatsapp_template",
  "send_whatsapp_media",
  "send_whatsapp_interactive",
  "send_whatsapp_list",
  "send_whatsapp_flow",
  "send_product",
  "send_email",
  "question",
] as const;

export function isMessageChannelStep(type: string): boolean {
  return (MESSAGE_CHANNEL_STEP_TYPES as readonly string[]).includes(type);
}

/** Índice do primeiro step de mensagem na ordem do array (= `position`). */
export function findFirstMessageStepIndex(steps: { type: string }[]): number {
  return steps.findIndex((s) => isMessageChannelStep(s.type));
}

/** Gatilhos cuja mensagem/ticket já define o canal de envio. */
export const INBOUND_CHANNEL_TRIGGER_TYPES = new Set([
  "message_received",
  "message_sent",
  "conversation_created",
]);

/** Conexões (`Channel.id`) do gatilho. Vazio = qualquer canal. */
export function readTriggerChannelIds(cfg: unknown): string[] {
  const c = asRecord(cfg);
  const many = Array.isArray(c.channelIds)
    ? c.channelIds.filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((s) => s.trim())
    : [];
  if (many.length > 0) return [...new Set(many)];
  const one = typeof c.channelId === "string" ? c.channelId.trim() : "";
  return one ? [one] : [];
}

/** `all` = qualquer conexão; `selected` = só os ids em `channelIds`. */
export function readTriggerChannelScope(cfg: unknown): "all" | "selected" {
  const c = asRecord(cfg);
  if (c.channelScope === "selected") return "selected";
  if (c.channelScope === "all") return "all";
  return readTriggerChannelIds(cfg).length > 0 ? "selected" : "all";
}

/**
 * Allowlist do passo de envio. `null` = todos os canais ativos.
 * `channelId` legado sozinho NÃO vira filtro — era override de envio.
 */
export function readStepAllowedChannelIds(cfg: unknown): string[] | null {
  const c = asRecord(cfg);
  if (c.channelScope === "all") return null;
  const many = Array.isArray(c.channelIds)
    ? c.channelIds
        .filter((x): x is string => typeof x === "string" && x.trim() !== "")
        .map((s) => s.trim())
    : [];
  const unique = [...new Set(many)];
  if (c.channelScope === "selected") return unique;
  return unique.length > 0 ? unique : null;
}

export function readStepChannelScope(cfg: unknown): "all" | "selected" {
  return readStepAllowedChannelIds(cfg) === null ? "all" : "selected";
}

/**
 * Padrão dos passos de envio: 1 conexão no gatilho → esse id;
 * vários/nenhum → vazio (canal da conversa / entrada).
 */
export function inheritedChannelFromTrigger(triggerConfig: unknown): string {
  const ids = readTriggerChannelIds(triggerConfig);
  return ids.length === 1 ? ids[0]! : "";
}

export function triggerBindsInboundChannel(triggerType: string): boolean {
  return INBOUND_CHANNEL_TRIGGER_TYPES.has(triggerType);
}

/**
 * 1º passo de mensagem só exige `channelId` quando a org tem 2+ canais
 * E o gatilho não amarra o envio à entrada (inbound / 1 conexão).
 */
export function validateFirstMessageChannel(
  steps: { type: string; config?: unknown }[],
  connectedChannelCount: number,
  opts?: { triggerType?: string; triggerConfig?: unknown },
): string | null {
  if (connectedChannelCount < 2) return null;
  if (opts?.triggerType && triggerBindsInboundChannel(opts.triggerType)) return null;
  if (readTriggerChannelIds(opts?.triggerConfig).length === 1) return null;
  const idx = findFirstMessageStepIndex(steps);
  if (idx < 0) return null;
  const cfg = asRecord(steps[idx].config);
  const channelId = typeof cfg.channelId === "string" ? cfg.channelId.trim() : "";
  return channelId ? null : "MISSING_CHANNEL_ON_FIRST_MESSAGE_STEP";
}

export function triggerTypeLabel(t: string): string {
  const map: Record<string, string> = {
    stage_changed: "Estágio alterado",
    tag_added: "Tag adicionada",
    lead_score_reached: "Lead score atingido",
    deal_created: "Negócio criado",
    deal_won: "Negócio ganho",
    deal_lost: "Negócio perdido",
    contact_created: "Contato criado",
    conversation_created: "Conversa criada",
    lifecycle_changed: "Ciclo de vida alterado",
    agent_changed: "Agente alterado",
    message_received: "Mensagem recebida",
    message_sent: "Mensagem enviada",
    call_received: "Ligação recebida",
    call_made: "Ligação realizada",
    call_permission_granted: "Permissão de ligação concedida",
    conversation_tabulated: "Conversa encerrada",
    whatsapp_session_expiring: "Sessão do WhatsApp prestes a encerrar",
    lead_distributed: "Lead distribuído (consultor humano)",
    manual: "Manual (executar pela conversa)",
  };
  return map[t] ?? t;
}

export function stepTypeLabel(t: string): string {
  const map: Record<string, string> = {
    send_email: "Enviar e-mail",
    move_stage: "Mover estágio",
    mark_deal_won: "Ganho",
    mark_deal_lost: "Perda",
    assign_owner: "Atribuir responsável",
    transfer_department: "Transferir para departamento",
    add_tag: "Adicionar tag",
    remove_tag: "Remover tag",
    update_field: "Atualizar campo",
    create_activity: "Criar atividade",
    send_whatsapp_message: "Mensagem WhatsApp",
    send_whatsapp_template: "Template WhatsApp",
    send_whatsapp_media: "Mídia WhatsApp",
    send_whatsapp_interactive: "Botões WhatsApp",
    send_whatsapp_list: "Lista WhatsApp",
    send_whatsapp_flow: "Formulário WhatsApp",
    webhook: "Webhook",
    delay: "Atraso",
    condition: "Condição",
    round_robin: "Round Robin de caminhos",
    update_lead_score: "Atualizar lead score",
    question: "Pergunta ao lead",
    wait_for_reply: "Aguardar resposta",
    set_variable: "Definir variável",
    goto: "Ir para (Goto)",
    transfer_automation: "Transferir automação",
    stop_automation: "Encerrar automação",
    finish: "Finalizar fluxo",
    create_deal: "Criar negócio",
    finish_conversation: "Encerrar conversa",
    tabulate_conversation: "Tabular conversa",
    business_hours: "Horário comercial",
    check_agent_status: "Status do agente",
    ask_ai_agent: "Perguntar ao agente IA",
    transfer_to_ai_agent: "Transferir para agente IA",
    consume_stock: "Baixar estoque",
    execute_distribution: "Executar distribuição",
    send_product: "Enviar produto",
  };
  return map[t] ?? t;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function summarizeTriggerChannelScope(
  c: Record<string, unknown>,
  lookup?: Record<string, string>,
): string {
  if (readTriggerChannelScope(c) === "selected") {
    const ids = readTriggerChannelIds(c);
    if (ids.length === 0) return "Selecione os canais";
    if (ids.length === 1) {
      const id = ids[0]!;
      const name = lookup?.[id];
      return name && !looksLikeOpaqueId(name) ? name : "1 canal";
    }
    return `${ids.length} canais`;
  }
  const type = typeof c.channel === "string" ? c.channel.trim().toLowerCase() : "";
  if (type === "whatsapp") return "Todos os canais · WhatsApp";
  if (type === "email") return "Todos os canais · E-mail";
  return "Todos os canais";
}

function asStringList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .filter((x): x is string => typeof x === "string" && x.trim() !== "")
      .map((s) => s.trim());
  }
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function configIds(
  c: Record<string, unknown>,
  singular: string,
  plural: string,
): string[] {
  const many = asStringList(c[plural]);
  if (many.length) return many;
  return asStringList(c[singular]);
}


/** Nome gravado ou lookup — nunca devolve CUID/UUID. */
function resolveNamed(
  id: unknown,
  lookup: Record<string, string> | undefined,
  storedName: unknown,
  fallback: string,
): string | null {
  const raw = typeof id === "string" ? id.trim() : "";
  if (!raw) return null;
  const stored = typeof storedName === "string" ? storedName.trim() : "";
  if (stored && !looksLikeOpaqueId(stored)) return stored;
  const looked = lookup?.[raw];
  if (looked && !looksLikeOpaqueId(looked)) return looked;
  return fallback;
}

function resolveLabels(
  ids: string[],
  lookup: Record<string, string> | undefined,
  stored: unknown,
): string[] {
  const storedList = asStringList(stored);
  if (ids.length === 0) return storedList.filter((n) => !looksLikeOpaqueId(n));
  const out: string[] = [];
  for (let i = 0; i < ids.length; i++) {
    const n = lookup?.[ids[i]!] ?? storedList[i] ?? (ids.length === 1 ? storedList[0] : undefined);
    if (n && !looksLikeOpaqueId(n)) out.push(n);
  }
  return [...new Set(out)];
}

function labeledPart(
  names: string[],
  prefix: string,
  fallback?: string | null,
): string | null {
  if (names.length === 0) return fallback ?? null;
  if (names.length === 1) return `${prefix}: ${names[0]}`;
  if (names.length === 2) return `${prefix}: ${names[0]}, ${names[1]}`;
  return `${prefix}: ${names[0]} +${names.length - 1}`;
}

function pipelineSummaryPart(
  c: Record<string, unknown>,
  lookup?: Record<string, string>,
): string | null {
  const id = typeof c.pipelineId === "string" ? c.pipelineId.trim() : "";
  if (!id) return null;
  return labeledPart(resolveLabels([id], lookup, c.pipelineName), "Pipeline", "Pipeline filtrado");
}

function stageSummaryPart(
  c: Record<string, unknown>,
  lookup: Record<string, string> | undefined,
  keys: { id: string; ids: string; name: string; names: string; prefix: string },
): string | null {
  const ids = configIds(c, keys.id, keys.ids);
  const stored = asStringList(c[keys.names]).length ? c[keys.names] : c[keys.name];
  const names = resolveLabels(ids, lookup, stored);
  if (ids.length === 0 && names.length === 0) return null;
  return labeledPart(
    names,
    keys.prefix,
    ids.length > 1 ? "Estágios filtrados" : "Estágio filtrado",
  );
}

function departmentSummaryPart(
  c: Record<string, unknown>,
  lookup?: Record<string, string>,
): string | null {
  const id = typeof c.departmentId === "string" ? c.departmentId.trim() : "";
  if (!id) return null;
  return labeledPart(
    resolveLabels([id], lookup, c.departmentName),
    "Departamento",
    "Departamento filtrado",
  );
}

export function summarizeTriggerConfig(
  triggerType: string,
  triggerConfig: unknown,
  lookup?: Record<string, string>,
): string {
  const c = asRecord(triggerConfig);
  switch (triggerType) {
    case "stage_changed": {
      const parts = [
        stageSummaryPart(c, lookup, {
          id: "fromStageId",
          ids: "fromStageIds",
          name: "fromStageName",
          names: "fromStageNames",
          prefix: "De",
        }),
        stageSummaryPart(c, lookup, {
          id: "toStageId",
          ids: "toStageIds",
          name: "toStageName",
          names: "toStageNames",
          prefix: "Para",
        }),
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "Qualquer mudança de estágio";
    }
    case "tag_added": {
      if (c.tagName) return `Tag: ${String(c.tagName)}`;
      if (c.tagId) return "Tag filtrada";
      return "Qualquer tag";
    }
    case "lead_score_reached":
      return `Mín.: ${c.threshold ?? c.minScore ?? "—"}`;
    case "deal_created":
    case "deal_won":
    case "deal_lost": {
      const parts = [
        pipelineSummaryPart(c, lookup),
        stageSummaryPart(c, lookup, {
          id: "stageId",
          ids: "stageIds",
          name: "stageName",
          names: "stageNames",
          prefix: "Estágio",
        }),
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "Qualquer pipeline";
    }
    case "contact_created": {
      const parts = [
        pipelineSummaryPart(c, lookup),
        stageSummaryPart(c, lookup, {
          id: "stageId",
          ids: "stageIds",
          name: "stageName",
          names: "stageNames",
          prefix: "Estágio",
        }),
      ].filter(Boolean);
      return parts.length ? parts.join(" · ") : "Novo contato";
    }
    case "conversation_created":
      return summarizeTriggerChannelScope(c, lookup);
    case "whatsapp_session_expiring":
      return `${String(c.hoursBeforeExpiry ?? 1)}h antes do encerramento`;
    case "lifecycle_changed": {
      const to = c.toLifecycle ?? c.lifecycleStage;
      const from = c.fromLifecycle ?? c.from;
      if (to && from) return `${String(from)} → ${String(to)}`;
      if (to) return `Para: ${String(to)}`;
      return "Qualquer mudança";
    }
    case "agent_changed": {
      const name = typeof c.toAgentName === "string" ? c.toAgentName : "";
      if (name && !looksLikeOpaqueId(name)) return `Agente: ${name}`;
      const toAgent = c.toAgentId;
      return toAgent ? "Agente filtrado" : "Qualquer agente";
    }
    case "call_received":
    case "call_made": {
      const status = c.status ? String(c.status) : "";
      const statusLabel: Record<string, string> = {
        answered: "Atendidas",
        missed: "Não atendidas",
      };
      return status ? (statusLabel[status] ?? status) : "Qualquer ligação";
    }
    case "call_permission_granted": {
      const t = c.consentType ? String(c.consentType) : "";
      if (t === "PERMANENT") return "Permanente";
      if (t === "TEMPORARY") return "Temporária 7 dias";
      return "Qualquer tipo";
    }
    case "message_received":
    case "message_sent": {
      const parts = [
        summarizeTriggerChannelScope(c, lookup),
        pipelineSummaryPart(c, lookup),
        stageSummaryPart(c, lookup, {
          id: "stageId",
          ids: "stageIds",
          name: "stageName",
          names: "stageNames",
          prefix: "Estágio",
        }),
        c.dealStatus
          ? ({
              OPEN: "Status: Em aberto",
              WON: "Status: Ganho",
              LOST: "Status: Perdido",
              "WON,LOST": "Status: Ganho ou Perdido",
              "LOST,WON": "Status: Ganho ou Perdido",
            } as Record<string, string>)[String(c.dealStatus).toUpperCase()] ??
            `Status: ${String(c.dealStatus).toUpperCase()}`
          : null,
      ];
      return parts.filter(Boolean).join(" · ");
    }
    case "lead_distributed": {
      return departmentSummaryPart(c, lookup) ?? "Quando um consultor humano assume o lead";
    }
    case "manual":
      return "Disparada manualmente da conversa";
    case "conversation_tabulated": {
      if (c.tabulationLabel) return `Tabulação: ${String(c.tabulationLabel)}`;
      const dept = departmentSummaryPart(c, lookup);
      if (dept) return dept;
      if (c.requireTabulation === true) return "Qualquer encerramento tabulado";
      return "Qualquer encerramento";
    }
    default:
      return "—";
  }
}

export function summarizeStepConfig(stepType: string, config: unknown, lookup?: Record<string, string>): string {
  const c = asRecord(config);
  switch (stepType) {
    case "send_email":
      return c.subject ? String(c.subject) : c.to ? `Para: ${String(c.to)}` : "Configurar e-mail";
    case "move_stage":
      return resolveNamed(c.stageId, lookup, c.stageName, "Estágio") ?? "Definir estágio";
    case "mark_deal_won":
      return resolveNamed(c.pipelineId, lookup, c.pipelineName, "Funil") ?? "Selecionar funil";
    case "mark_deal_lost": {
      const pipelineLabel = resolveNamed(c.pipelineId, lookup, c.pipelineName, "Funil");
      const reason = c.lostReason && !looksLikeOpaqueId(String(c.lostReason)) ? String(c.lostReason) : "";
      if (pipelineLabel && reason) return `${pipelineLabel} · ${reason}`;
      if (pipelineLabel) return `Funil: ${pipelineLabel} (sem motivo)`;
      return "Selecionar funil e motivo";
    }
    case "assign_owner": {
      const target =
        c.assignAll || c.assignTo === "all" || c.target === "all" || c.target === "both"
          ? "all"
          : c.assignTo
            ? String(c.assignTo)
            : c.target
              ? String(c.target)
              : "deal";
      const targetLabel =
        target === "all" || target === "both"
          ? "todas as entidades"
          : target === "contact"
            ? "contato"
            : target === "conversation"
              ? "conversa"
              : "negócio";
      const who =
        resolveNamed(c.departmentId, lookup, c.departmentName, "Departamento") ||
        resolveNamed(c.userId, lookup, c.userLabel, "Usuário") ||
        "";
      if (!who) return `Limpar responsável (${targetLabel})`;
      return `${who} · ${targetLabel}`;
    }
    case "transfer_department":
      return resolveNamed(c.departmentId, lookup, c.departmentName, "Departamento") ?? "Selecionar departamento";
    case "add_tag":
    case "remove_tag":
      return resolveNamed(c.tagId, lookup, c.tagName, "Tag") ?? "Definir tag";
    case "update_field":
      return c.field ? `${String(c.field)} = ${String(c.value ?? "")}` : "Campo / valor";
    case "create_activity":
      return c.title ? String(c.title) : "Nova atividade";
    case "send_whatsapp_message":
      return c.content
        ? `${c.sendAs === "assignee" ? "[Responsável] " : ""}${String(c.content).slice(0, 40)}${String(c.content).length > 40 ? "…" : ""}`
        : c.sendAs === "assignee"
          ? "Mensagem (como responsável)"
          : "Mensagem";
    case "send_whatsapp_template": {
      const tplLabel = c.templateLabel ? String(c.templateLabel) : "";
      const tplName = c.templateName ? String(c.templateName) : "";
      return tplLabel || tplName || "Template";
    }
    case "send_whatsapp_media": {
      const mtype = c.mediaType ?? "image";
      const mtypeLabel: Record<string, string> = { image: "Imagem", video: "Vídeo", audio: "Áudio", document: "Documento" };
      const caption = c.caption ? `: ${String(c.caption).slice(0, 30)}` : "";
      return `${mtypeLabel[String(mtype)] ?? String(mtype)}${caption}`;
    }
    case "send_whatsapp_interactive": {
      const btns = Array.isArray(c.buttons) ? c.buttons.length : 0;
      const bodyText = c.body ? String(c.body).slice(0, 30) : "";
      return btns > 0 ? `[${btns} botões] ${bodyText}` : bodyText || "Configurar botões";
    }
    case "send_whatsapp_list": {
      const rows = Array.isArray(c.rows) ? c.rows.length : 0;
      const bodyText = c.body ? String(c.body).slice(0, 30) : "";
      return rows > 0 ? `[${rows} itens] ${bodyText}` : bodyText || "Configurar lista";
    }
    case "send_whatsapp_flow": {
      const flowName = c.flowName ? String(c.flowName) : "";
      const bodyText = c.body ? String(c.body).slice(0, 30) : "";
      return flowName || bodyText || "Selecionar formulário";
    }
    case "webhook":
      return c.url ? String(c.url).replace(/^https?:\/\//, "").slice(0, 36) : "URL";
    case "delay": {
      const ms = Number(c.ms ?? c.milliseconds ?? 0);
      if (ms >= 86_400_000) return `${ms / 86_400_000} d`;
      if (ms >= 3_600_000) return `${ms / 3_600_000} h`;
      if (ms >= 60_000) return `${ms / 60_000} min`;
      return ms ? `${ms / 1000} s` : "Duração";
    }
    case "condition":
      return summarizeConditionConfig(c, lookup);
    case "round_robin":
      return summarizeRoundRobinConfig(c);
    case "update_lead_score":
      return "Recalcular score";
    case "question": {
      const msg = c.message ?? c.question;
      const btns = Array.isArray(c.buttons) ? c.buttons : [];
      const prefix = btns.length > 0 ? `[${btns.length} botões] ` : "";
      return msg ? prefix + String(msg).slice(0, 40) + (String(msg).length > 40 ? "…" : "") : "Aguardando resposta";
    }
    case "wait_for_reply": {
      const timeoutMs = Number(c.timeoutMs ?? 0);
      const parts: string[] = ["Até a mensagem recebida"];
      if (timeoutMs > 0) {
        if (timeoutMs >= 3_600_000) parts.push(`⏱ ${timeoutMs / 3_600_000}h`);
        else if (timeoutMs >= 60_000) parts.push(`⏱ ${timeoutMs / 60_000}min`);
        else parts.push(`⏱ ${timeoutMs / 1000}s`);
      }
      return parts.join(" · ");
    }
    case "finish":
      return "Encerrar automação";
    case "set_variable": {
      const name = c.variableName ?? c.name;
      return name ? `{{${String(name)}}} = ${String(c.value ?? "…")}` : "Definir variável";
    }
    case "goto": {
      const target = c.targetStepId;
      return target ? `Ir para: ${String(target).slice(0, 12)}` : "Definir destino";
    }
    case "transfer_automation": {
      const tName = resolveNamed(c.targetAutomationId, lookup, c.targetAutomationName, "Automação");
      return tName ? `→ ${tName}` : "Selecionar automação";
    }
    case "stop_automation":
      return "Parar automação atual";
    case "create_deal": {
      const title = c.title ? String(c.title) : "";
      return title || "Novo negócio";
    }
    case "finish_conversation":
      return "Resolver conversas abertas";
    case "tabulate_conversation": {
      const label = c.tabulationLabel ? String(c.tabulationLabel) : "";
      const closes = c.closeConversation !== false;
      if (!label) return "Selecionar tabulação";
      return closes ? `${label} + encerrar` : label;
    }
    case "send_product": {
      const name = c.productName ? String(c.productName) : "";
      const channel = c.channel ? String(c.channel) : "";
      if (name && channel) return `${name} · ${channel}`;
      if (name) return `Produto: ${name}`;
      return resolveNamed(c.productId, lookup, null, "Produto") ?? "Selecionar produto";
    }
    case "consume_stock":
      return "Baixar estoque dos produtos do negócio";
    case "execute_distribution": {
      const storedNames = Array.isArray(c.departmentNames)
        ? (c.departmentNames as unknown[]).filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0 && !looksLikeOpaqueId(v),
          )
        : [];
      const ids = Array.isArray(c.departmentIds)
        ? (c.departmentIds as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        : [];
      const names =
        storedNames.length > 0
          ? storedNames
          : ids.map((id) => lookup?.[id]).filter((n): n is string => !!n && !looksLikeOpaqueId(n));
      const t = c.distributionType ? String(c.distributionType) : "";
      if (names.length > 0) {
        const deptLabel =
          names.length <= 2
            ? names.join(", ")
            : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
        return t ? `${deptLabel} · ${t}` : deptLabel;
      }
      return t ? `Distribuição: ${t}` : "Distribuição inteligente";
    }
    case "business_hours": {
      const tz = c.timezone ? String(c.timezone) : "America/Sao_Paulo";
      return `Fuso: ${tz}`;
    }
    case "check_agent_status":
      return "Responsável da conversa";
    case "ask_ai_agent": {
      const agentName = resolveNamed(c.agentId, lookup, c.agentLabel ?? c.agentName, "Agente");
      return agentName ? `Agente: ${agentName}` : "Selecionar agente";
    }
    case "transfer_to_ai_agent": {
      const agentName = resolveNamed(c.agentUserId, lookup, c.agentLabel, "Agente IA");
      return agentName ? `→ ${agentName}` : "Selecionar agente IA";
    }
    default:
      return "—";
  }
}

/**
 * Retorna true quando o passo não tem a configuração mínima pra executar
 * sem falhar em runtime. Usado no canvas pra destacar visualmente steps
 * incompletos — o operador não precisa esperar a automação rodar e falhar
 * pra descobrir que esqueceu de preencher um texto obrigatório.
 */
export function isStepIncomplete(
  stepType: string,
  config: unknown,
  opts?: { requireChannel?: boolean },
): boolean {
  const c = typeof config === "object" && config !== null ? (config as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (opts?.requireChannel && isMessageChannelStep(stepType) && !str(c.channelId)) {
    return true;
  }
  switch (stepType) {
    case "mark_deal_won":
      return !str(c.pipelineId);
    case "mark_deal_lost":
      return !str(c.pipelineId) || !str(c.lostReason);
    case "send_whatsapp_message":
      return !str(c.content);
    case "send_product":
      return !str(c.productId);
    case "send_whatsapp_template":
      return !str(c.templateName);
    case "send_whatsapp_media":
      return !str(c.mediaUrl) && !str(c.mediaId);
    case "send_whatsapp_interactive":
      return !str(c.body) || !(Array.isArray(c.buttons) && c.buttons.length > 0);
    case "send_whatsapp_list":
      return (
        !str(c.body) ||
        !str(c.button) ||
        !(Array.isArray(c.rows) && c.rows.length > 0)
      );
    case "send_whatsapp_flow":
      return !str(c.flowDefinitionId);
    case "send_email":
      return !str(c.to) || !str(c.subject) || !str(c.body);
    case "webhook":
      return !str(c.url);
    case "question":
      return !(str(c.message) || str(c.question));
    case "goto":
      return !str(c.targetStepId);
    case "transfer_automation":
      return !str(c.targetAutomationId);
    case "ask_ai_agent":
      return !str(c.agentId);
    case "transfer_to_ai_agent":
      return !str(c.agentUserId);
    case "transfer_department":
      return !str(c.departmentId);
    default:
      return false;
  }
}

export function defaultStepConfig(stepType: string): Record<string, unknown> {
  switch (stepType) {
    case "send_email":
      return { to: "", subject: "", body: "" };
    case "move_stage":
      return { stageId: "", continueIfNoDeal: false };
    case "mark_deal_won":
      return { pipelineId: "", pipelineName: "", continueIfNoDeal: false };
    case "mark_deal_lost":
      return { pipelineId: "", pipelineName: "", lostReason: "", continueIfNoDeal: false };
    case "assign_owner":
      return { userId: "", target: "deal" };
    case "transfer_department":
      return { departmentId: "", departmentName: "" };
    case "add_tag":
    case "remove_tag":
      return { tagName: "" };
    case "update_field":
      return { field: "", value: "" };
    case "create_activity":
      return { type: "TASK", title: "", description: "" };
    case "send_whatsapp_message":
      // sendAs: "bot" | "assignee" — ver backend automation-executor.
      return {
        content: "",
        sendAs: "bot",
        failureAction: "stop",
        timeoutMs: 86_400_000,
        timeoutAction: "continue",
        timeoutGotoStepId: "",
      };
    case "send_product":
      return {
        productId: "",
        productName: "",
        content: "",
        unitPrice: "",
        discountPercent: "",
        channel: "",
      };
    case "send_whatsapp_template":
      return {
        templateName: "",
        languageCode: "pt_BR",
        failureAction: "stop",
        timeoutMs: 86_400_000,
        timeoutAction: "continue",
        timeoutGotoStepId: "",
      };
    case "send_whatsapp_media":
      return { mediaType: "image", mediaUrl: "", caption: "", failureAction: "stop" };
    case "send_whatsapp_interactive":
      return {
        body: "", buttons: [], header: "", footer: "",
        elseGotoStepId: "", saveToVariable: "",
        timeoutMs: 86_400_000, timeoutAction: "continue", timeoutGotoStepId: "",
        failureAction: "stop",
      };
    case "send_whatsapp_list":
      return {
        body: "",
        button: "Ver opções",
        sectionTitle: "",
        rows: [],
        header: "",
        footer: "",
        elseGotoStepId: "",
        saveToVariable: "",
        timeoutMs: 86_400_000,
        timeoutAction: "continue",
        timeoutGotoStepId: "",
        failureAction: "stop",
      };
    case "send_whatsapp_flow":
      return {
        flowDefinitionId: "",
        flowName: "",
        body: "",
        flowCta: "Abrir formulário",
        header: "",
        footer: "",
        saveToVariable: "",
        timeoutMs: 86_400_000,
        timeoutAction: "continue",
        timeoutGotoStepId: "",
        failureAction: "stop",
      };
    case "webhook":
      return { url: "", method: "POST", headers: [], body: "" };
    case "delay":
      return { ms: 60_000 };
    case "condition": {
      const cfg: ConditionConfig = {
        branches: [
          {
            id: newBranchId(),
            rules: [{ field: "", op: "eq", value: "" }],
          },
        ],
      };
      return cfg as unknown as Record<string, unknown>;
    }
    case "round_robin": {
      const cfg: RoundRobinConfig = {
        options: [{ id: newRoundRobinOptionId() }, { id: newRoundRobinOptionId() }],
      };
      return cfg as unknown as Record<string, unknown>;
    }
    case "update_lead_score":
      return {};
    case "question":
      return {
        message: "", buttons: [], saveToVariable: "",
        timeoutMs: 86_400_000, timeoutAction: "continue",
        timeoutGotoStepId: "", elseGotoStepId: "",
        failureAction: "stop",
      };
    case "wait_for_reply":
      return {
        timeoutMs: 60_000, receivedGotoStepId: "", timeoutGotoStepId: "", saveToVariable: "",
      };
    case "finish":
      return { action: "stop" };
    case "set_variable":
      return { variableName: "", value: "" };
    case "goto":
      return { targetStepId: "" };
    case "transfer_automation":
      return { targetAutomationId: "", targetAutomationName: "" };
    case "stop_automation":
      return {};
    case "create_deal":
      return { stageId: "", title: "Novo negócio", value: 0 };
    case "finish_conversation":
      return {};
    case "tabulate_conversation":
      // `closeConversation` liga por padrao: encerrar junto grava a tabulacao
      // na mesma operacao do fechamento. Tabular depois de encerrar perderia o
      // departamento da conversa (o fechamento limpa, salvo
      // `conversation.keepDepartmentOnEnd`).
      return {
        departmentId: "",
        tabulationId: "",
        tabulationLabel: "",
        closeConversation: true,
      };
    case "business_hours":
      return {
        schedule: [
          { days: [1, 2, 3, 4, 5], from: "09:00", to: "18:00" },
        ],
        timezone: "America/Sao_Paulo",
        elseStepId: "",
      };
    case "check_agent_status":
      return { elseStepId: "" };
    case "ask_ai_agent":
      return {
        agentId: "",
        agentLabel: "",
        /// Variáveis interpoladas com {{var}} são substituidas antes de
        /// enviar pro LLM. O resultado fica disponível como variável
        /// do contexto do nome abaixo.
        promptTemplate: "",
        saveToVariable: "ai_response",
      };
    case "transfer_to_ai_agent":
      return {
        agentUserId: "",
        agentLabel: "",
        // "deal" propaga via assignDealOwner; "contact" via
        // propagateOwnerToContactAndChat. Ambos acabam setando
        // conversation.assignedToId, que é o que `maybeReplyAsAIAgent`
        // olha pra decidir se assume a conversa.
        target: "deal",
      };
    case "execute_distribution":
      return { distributionType: "", departmentIds: [], departmentNames: [] };
    default:
      return {};
  }
}

export function newStepId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `step_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export type ApiAutomationStep = {
  id: string;
  type: string;
  config: unknown;
  /** APIs antigas/exportações podem omitir; a conversão usa a ordem do array. */
  position?: number;
};

function normalizeLegacyStepConfig(
  stepType: string,
  rawConfig: unknown,
): Record<string, unknown> {
  const cfg =
    typeof rawConfig === "object" && rawConfig !== null && !Array.isArray(rawConfig)
      ? { ...(rawConfig as Record<string, unknown>) }
      : {};

  // Compat legado (Kommo parser): vários passos usavam `_nextStepId`.
  if (
    (typeof cfg.nextStepId !== "string" || !cfg.nextStepId) &&
    typeof cfg._nextStepId === "string" &&
    cfg._nextStepId
  ) {
    cfg.nextStepId = cfg._nextStepId;
  }

  // Question legado podia salvar resposta em `_answeredGotoStepId`.
  if (
    stepType === "question" &&
    (typeof cfg.elseGotoStepId !== "string" || !cfg.elseGotoStepId) &&
    typeof cfg._answeredGotoStepId === "string" &&
    cfg._answeredGotoStepId
  ) {
    cfg.elseGotoStepId = cfg._answeredGotoStepId;
  }

  // Condition legado (import Kommo):
  // - `_branches[{ conditions, gotoStepId }]` -> `branches[{ rules, nextStepId }]`
  // - `_falseGotoStepId` -> `elseStepId`
  // - `_trueGotoStepId`  -> `nextStepId` (formato antigo de 1 regra)
  if (stepType === "condition") {
    if (
      (typeof cfg.nextStepId !== "string" || !cfg.nextStepId) &&
      typeof cfg._trueGotoStepId === "string" &&
      cfg._trueGotoStepId
    ) {
      cfg.nextStepId = cfg._trueGotoStepId;
    }

    if (
      (typeof cfg.elseStepId !== "string" || !cfg.elseStepId) &&
      typeof cfg._falseGotoStepId === "string" &&
      cfg._falseGotoStepId
    ) {
      cfg.elseStepId = cfg._falseGotoStepId;
    }

    if (!Array.isArray(cfg.branches) && Array.isArray(cfg._branches)) {
      const legacyBranches = cfg._branches as Record<string, unknown>[];
      cfg.branches = legacyBranches
        .map((branch) => {
          const rawRules = Array.isArray(branch.conditions)
            ? (branch.conditions as Record<string, unknown>[])
            : [];
          const rules = rawRules
            .map((rule) => {
              const field =
                typeof rule.field === "string"
                  ? rule.field
                  : typeof rule.path === "string"
                    ? rule.path
                    : "";
              if (!field) return null;
              return {
                field,
                op: typeof rule.op === "string" ? rule.op : "eq",
                value: rule.value ?? "",
              };
            })
            .filter((r) => r !== null);

          if (rules.length === 0) return null;

          return {
            id: newBranchId(),
            rules,
            nextStepId:
              typeof branch.gotoStepId === "string" && branch.gotoStepId
                ? branch.gotoStepId
                : undefined,
          };
        })
        .filter((b) => b !== null);
    }
  }

  return cfg;
}

export function apiStepsToWorkflow(steps: ApiAutomationStep[]): AutomationStep[] {
  return steps.map((s) => ({
    id: s.id,
    type: s.type,
    config: normalizeLegacyStepConfig(s.type, s.config),
  }));
}

export function workflowStepsToPayload(steps: AutomationStep[]): { id: string; type: string; config: unknown }[] {
  return steps.map(({ id, type, config }) => {
    return { id, type, config };
  });
}

export function defaultTriggerConfig(triggerType: string): Record<string, unknown> {
  switch (triggerType) {
    case "stage_changed":
      return { fromStageId: "", toStageId: "" };
    case "tag_added":
      return { tagName: "" };
    case "lead_score_reached":
      return { threshold: 50 };
    case "deal_created":
    case "deal_won":
    case "deal_lost":
      return { pipelineId: "", stageId: "" };
    case "contact_created":
      return { pipelineId: "", stageId: "" };
    case "conversation_created":
      return { channel: "", channelIds: [], channelScope: "all" };
    case "lifecycle_changed":
      return { fromLifecycle: "", toLifecycle: "" };
    case "agent_changed":
      return { toAgentId: "" };
    case "message_received":
    case "message_sent":
      return { channel: "", channelIds: [], channelScope: "all", pipelineId: "", stageId: "", dealStatus: "" };
    case "call_received":
    case "call_made":
      return { status: "" };
    case "call_permission_granted":
      return { consentType: "" };
    case "lead_distributed":
      return { departmentId: "" };
    case "manual":
      return {};
    case "conversation_tabulated":
      return { departmentId: "", tabulationId: "", tabulationLabel: "", requireTabulation: false };
    case "whatsapp_session_expiring":
      return { hoursBeforeExpiry: 1 };
    default:
      return {};
  }
}
