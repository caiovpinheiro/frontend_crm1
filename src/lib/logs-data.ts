// ============================================================================
// Tipos e normalização dos registros de execução exibidos pelas modais de
// Logs / Inspeção da Sessão do canvas.
//
// A fonte é `GET /api/automations/:id/logs` — até 24/ago/26 este módulo
// FABRICAVA as entradas com um PRNG a partir dos contadores dos cards, o que
// mostrava histórico inexistente. O gerador foi removido.
// ============================================================================

import { stepTypeLabel, triggerTypeLabel } from "@/lib/automation-workflow"

export type LogStatus = "success" | "alert" | "error"

export interface LogWebhookEvent {
  id: string
  receivedAt: string
  eventType: string
  objectType?: string | null
  phoneNumberId?: string | null
  waMessageId?: string | null
  fromPhone?: string | null
  signatureValid?: boolean
  processed?: boolean
  processingError?: string | null
}

export interface LogEntry {
  id: string
  sessionId: string
  status: LogStatus
  rawStatus: string
  title: string
  message: string
  timestamp: string // ISO
  contactId: string
  dealId: string
  conversationId: string | null
  conversationNumber: number | null
  contactLabel: string
  dealLabel: string
  contactPhone: string | null
  stepType: string | null
  eventLabel: string | null
  channelLabel: string | null
  snippet: string | null
  reason: string | null
  payload: Record<string, unknown> | null
  webhook: LogWebhookEvent | null
  summary: Record<string, string | number | boolean>
  params: Record<string, string | number | boolean>
}

const STATUS_TITLE: Record<LogStatus, string> = {
  success: "Concluído com sucesso",
  alert: "Concluído com alerta",
  error: "Falha na execução",
}

const STATUS_META: Record<LogStatus, { label: string; code: string }> = {
  success: { label: "Concluído com sucesso", code: "SUCCESS" },
  alert: { label: "Alerta (pulada)", code: "SKIPPED" },
  error: { label: "Erro (falhou)", code: "FAILED" },
}

const MISSING_REASON = "motivo não registrado nesta execução"
const PAYLOAD_REASON_KEYS = [
  "reason",
  "motivo",
  "error",
  "erro",
  "cause",
  "why",
  "skipReason",
  "failureReason",
]

const EVENT_LABEL: Record<string, string> = {
  continue: "Continuação do fluxo",
}

export function statusMeta(status: LogStatus) {
  return STATUS_META[status]
}

/** Linha crua de `automation_logs`, como devolvida pela API. */
export interface AutomationLogRow {
  id: string
  status: string
  message?: string | null
  contactId?: string | null
  dealId?: string | null
  conversationId?: string | null
  conversationNumber?: number | string | null
  stepId?: string | null
  stepType?: string | null
  executedAt: string
  payload?: Record<string, unknown> | null
  contactName?: string | null
  contactPhone?: string | null
  dealName?: string | null
  dealNumber?: number | null
  metaWebhookEvent?: LogWebhookEvent | null
}

/**
 * Vocabulário do backend → o das abas do canvas. Igual aos rodapés dos
 * cards: `SUCCESS`/`COMPLETED` = sucesso, `SKIPPED` = alerta,
 * `FAILED`/`FAILED_HANDLED` = erro. `STARTED` é eco do disparo e não
 * entra na lista (ver `isTriggerEcho`). Desconhecido cai em alerta.
 */
function toLogStatus(raw: string): LogStatus {
  switch (raw) {
    case "SUCCESS":
    case "COMPLETED":
    case "COMPLETED_WITH_ERRORS":
      return "success"
    case "FAILED":
    case "FAILED_HANDLED":
      return "error"
    default:
      return "alert"
  }
}

/** Eco do gatilho (`stepId` nulo + STARTED) — a linha útil é o desfecho. */
export function isTriggerEcho(row: Pick<AutomationLogRow, "status" | "stepId">): boolean {
  return row.status === "STARTED" && (row.stepId == null || row.stepId === "")
}

function shortRef(id: string): string {
  return id.length > 8 ? id.slice(-6) : id
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function payloadString(
  payload: Record<string, unknown> | null,
  keys: string[],
): string | null {
  if (!payload) return null
  for (const key of keys) {
    const value = payload[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

/** Uma chave de evento/passo (`message_sent`) → rótulo em português. */
export function eventTypeLabel(raw: string): string {
  const key = raw.trim()
  if (!key) return raw
  if (EVENT_LABEL[key]) return EVENT_LABEL[key]
  const lower = key.toLowerCase()
  if (EVENT_LABEL[lower]) return EVENT_LABEL[lower]
  const trigger = triggerTypeLabel(lower)
  if (trigger !== lower) return trigger
  const triggerOrig = triggerTypeLabel(key)
  if (triggerOrig !== key) return triggerOrig
  const step = stepTypeLabel(key)
  if (step !== key) return step
  const stepLower = stepTypeLabel(lower)
  if (stepLower !== lower) return stepLower
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/i.test(key)) {
    return key.replace(/_/g, " ")
  }
  return key
}

const EVENT_TOKEN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gi

function humanizeLogMessage(raw: string): string {
  const sep = " — "
  const idx = raw.indexOf(sep)
  if (idx === -1) {
    return raw.replace(EVENT_TOKEN, (token) => eventTypeLabel(token))
  }
  const head = raw.slice(0, idx)
  const tail = raw.slice(idx + sep.length)
  const labeled = eventTypeLabel(tail)
  if (labeled !== tail) return `${head}${sep}${labeled}`
  return `${head}${sep}${tail.replace(EVENT_TOKEN, (token) => eventTypeLabel(token))}`
}

function eventNameFromRow(row: AutomationLogRow): string | null {
  const payload = asRecord(row.payload)
  const raw =
    payloadString(payload, ["evento", "event", "triggerType", "trigger"]) ||
    row.stepType ||
    row.metaWebhookEvent?.eventType ||
    null
  return raw ? eventTypeLabel(raw) : null
}

function channelFromRow(row: AutomationLogRow): string | null {
  const payload = asRecord(row.payload)
  const named = payloadString(payload, ["canal", "channel", "channelName"])
  if (named) return named
  const channelId = payloadString(payload, ["channelId"])
  if (channelId) return channelId.length > 16 ? `Canal ${shortRef(channelId)}` : channelId
  return null
}

function snippetFromRow(row: AutomationLogRow): string | null {
  const payload = asRecord(row.payload)
  return payloadString(payload, ["mensagem", "content", "text", "body"])
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value)
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim())
    return n > 0 ? n : null
  }
  return null
}

function payloadNumber(
  payload: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!payload) return null
  for (const key of keys) {
    const n = asPositiveInt(payload[key])
    if (n != null) return n
  }
  return null
}

/** Conversa do atendimento: campo da API ou o mesmo id no payload. */
function conversationFromRow(row: AutomationLogRow): {
  conversationId: string | null
  conversationNumber: number | null
} {
  const payload = asRecord(row.payload)
  const nested = asRecord(payload?.conversation)
  const conversationId =
    (typeof row.conversationId === "string" && row.conversationId.trim()) ||
    payloadString(payload, ["conversationId", "conversation_id"]) ||
    payloadString(nested, ["id", "conversationId"]) ||
    null
  const conversationNumber =
    asPositiveInt(row.conversationNumber) ??
    payloadNumber(payload, ["conversationNumber", "conversation_number"]) ??
    payloadNumber(nested, ["number", "conversationNumber"])
  return { conversationId, conversationNumber }
}

/** Deep-link do Inbox (`?c=` = número público, senão o id). */
export function inboxHrefForLog(
  entry: Pick<LogEntry, "conversationId" | "conversationNumber">,
): string | null {
  if (entry.conversationNumber != null) {
    return `/inbox?c=${encodeURIComponent(String(entry.conversationNumber))}`
  }
  if (entry.conversationId) {
    return `/inbox?c=${encodeURIComponent(entry.conversationId)}`
  }
  return null
}

/** Achata o `payload` (Json livre) para o formato chave→escalar da inspeção. */
function flattenPayload(
  payload: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  if (!payload) return out
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value
    } else {
      out[key] = JSON.stringify(value)
    }
  }
  return out
}

function flattenWebhook(
  webhook: LogWebhookEvent | null | undefined,
): Record<string, string | number | boolean> {
  if (!webhook) return {}
  const out: Record<string, string | number | boolean> = {}
  if (webhook.id) out.id = webhook.id
  if (webhook.receivedAt) out.receivedAt = webhook.receivedAt
  if (webhook.eventType) out.eventType = webhook.eventType
  if (webhook.objectType) out.objectType = webhook.objectType
  if (webhook.phoneNumberId) out.phoneNumberId = webhook.phoneNumberId
  if (webhook.waMessageId) out.waMessageId = webhook.waMessageId
  if (webhook.fromPhone) out.fromPhone = webhook.fromPhone
  if (typeof webhook.signatureValid === "boolean") {
    out.signatureValid = webhook.signatureValid
  }
  if (typeof webhook.processed === "boolean") out.processed = webhook.processed
  if (webhook.processingError) out.processingError = webhook.processingError
  return out
}

function isGenericOutcomeText(
  text: string,
  status: LogStatus,
  eventLabel: string | null,
): boolean {
  const t = text.trim()
  if (!t) return true
  if (t === STATUS_TITLE[status] || t === STATUS_META[status].label) return true
  if (eventLabel && (t === eventLabel || t.endsWith(` — ${eventLabel}`))) return true
  return false
}

function reasonFromPayload(payload: Record<string, unknown> | null): string | null {
  return payloadString(payload, PAYLOAD_REASON_KEYS)
}

/** Motivo da pulada/falha — nunca o rótulo genérico da aba. */
export function outcomeReason(
  status: LogStatus,
  message: string,
  payload: Record<string, unknown> | null,
  eventLabel: string | null,
): string {
  if (status === "success") return message
  const fromPayload = reasonFromPayload(payload)
  for (const candidate of [fromPayload, message]) {
    if (!candidate) continue
    const trimmed = candidate.trim()
    if (!isGenericOutcomeText(trimmed, status, eventLabel)) return trimmed
  }
  return MISSING_REASON
}

export function outcomeTitle(status: LogStatus, reason: string): string {
  if (status === "success") return reason
  const lower = reason.toLowerCase()
  if (
    lower.startsWith("pulada:") ||
    lower.startsWith("falha:") ||
    lower.startsWith("alerta:")
  ) {
    return reason
  }
  const prefix = status === "error" ? "Falha" : "Pulada"
  return `${prefix}: ${reason}`
}

export function automationLogToEntry(row: AutomationLogRow): LogEntry {
  const status = toLogStatus(row.status)
  const payload = asRecord(row.payload)
  const webhook = row.metaWebhookEvent ?? null
  const eventLabel = eventNameFromRow(row)
  const channelLabel = channelFromRow(row)
  const snippet = snippetFromRow(row)
  const rawMessage = row.message?.trim() || ""
  const humanized = rawMessage ? humanizeLogMessage(rawMessage) : ""
  const contactId = row.contactId ?? ""
  const dealId = row.dealId ?? ""
  const { conversationId, conversationNumber } = conversationFromRow(row)
  const contactLabel =
    row.contactName?.trim() ||
    (contactId ? `Contato ${shortRef(contactId)}` : "Sem contato")

  const reason =
    status === "success"
      ? null
      : outcomeReason(status, humanized || rawMessage, payload, eventLabel)
  const message =
    humanized ||
    (status === "success" ? STATUS_TITLE.success : (reason ?? STATUS_TITLE[status]))

  // Alerta/erro: o motivo vem primeiro. Sucesso: desfecho, não o gatilho.
  const title =
    status === "success"
      ? message && message !== STATUS_TITLE.success
        ? message
        : eventLabel
          ? `${contactLabel} — ${eventLabel}`
          : STATUS_TITLE.success
      : outcomeTitle(status, reason ?? MISSING_REASON)

  const summary: Record<string, string | number | boolean> = {
    ...(status !== "success" ? { motivo: reason ?? MISSING_REASON } : {}),
    id: row.id,
    status: row.status,
    message,
    executedAt: row.executedAt,
  }
  if (eventLabel) summary.evento = eventLabel
  if (channelLabel) summary.canal = channelLabel
  if (snippet) summary.mensagem = snippet
  if (row.stepId) summary.stepId = row.stepId
  if (row.stepType) summary.stepType = row.stepType
  if (contactId) summary.contactId = contactId
  if (dealId) summary.dealId = dealId
  if (conversationId) summary.conversationId = conversationId
  if (conversationNumber != null) summary.conversationNumber = conversationNumber
  if (row.contactName) summary.contactName = row.contactName
  if (row.contactPhone) summary.contactPhone = row.contactPhone
  if (row.dealName) summary.dealName = row.dealName
  if (row.dealNumber != null) summary.dealNumber = row.dealNumber

  const dealLabel =
    row.dealName?.trim() ||
    (row.dealNumber != null
      ? `Negócio #${row.dealNumber}`
      : dealId
        ? `Negócio ${shortRef(dealId)}`
        : "Sem negócio")

  return {
    id: row.id,
    sessionId: row.id,
    status,
    rawStatus: row.status,
    title,
    message,
    timestamp: row.executedAt,
    contactId,
    dealId,
    conversationId,
    conversationNumber,
    contactLabel,
    dealLabel,
    contactPhone: row.contactPhone?.trim() || null,
    stepType: row.stepType ?? null,
    eventLabel,
    channelLabel,
    snippet,
    reason,
    payload,
    webhook,
    summary,
    params: {
      ...(status !== "success" ? { motivo: reason ?? MISSING_REASON } : {}),
      ...flattenPayload(payload),
      ...flattenWebhook(webhook),
    },
  }
}

export function matchesLogQuery(entry: LogEntry, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase()
  if (!q) return true
  const haystack = [
    entry.title,
    entry.message,
    entry.eventLabel,
    entry.channelLabel,
    entry.snippet,
    entry.reason,
    entry.contactLabel,
    entry.dealLabel,
    entry.contactPhone,
    entry.contactId,
    entry.dealId,
    entry.conversationId,
    entry.conversationNumber != null ? String(entry.conversationNumber) : null,
    entry.stepType,
    formatDateTime(entry.timestamp),
    entry.payload ? JSON.stringify(entry.payload) : null,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
  return haystack.includes(q)
}

export function formatDateTime(iso: string) {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}, ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`
}
