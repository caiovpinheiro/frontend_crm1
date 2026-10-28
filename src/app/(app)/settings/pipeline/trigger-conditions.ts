/**
 * Condições de gatilho (estilo Kommo "Para todos os leads com").
 *
 * Além do gatilho em si (ex.: "movido para etapa X"), o operador pode
 * exigir que o negócio/contato satisfaça condições extras para a
 * automação rodar. As condições ficam salvas em `triggerConfig.conditions`
 * (array) e são avaliadas no backend em `evaluateTriggerConditions`
 * (`services/automation-triggers.ts`) com semântica E (todas precisam
 * bater).
 *
 * Este módulo é a fonte da verdade do CONTRATO (shape) no frontend:
 * parsing defensivo do JSON persistido, comparação (diff pro save) e o
 * default de uma condição nova.
 */

export type TriggerConditionType = "tag" | "field" | "channel" | "site_context" | "site_event";

/** Se o contato tem a tag (por nome — casa com id ou nome no backend). */
export interface TagCondition {
  type: "tag";
  tagName: string;
}

/** Se um campo (nativo ou personalizado) do contato/negócio == valor. */
export interface FieldCondition {
  type: "field";
  entity: "contact" | "deal";
  /** id do campo personalizado OU chave nativa (name, email, status, ...) */
  fieldId: string;
  /** rótulo pra exibir no chip (não usado na avaliação) */
  fieldLabel?: string;
  value: string;
}

/** Se o contato tem conversa no canal escolhido. */
export interface ChannelCondition {
  type: "channel";
  channelId: string;
  channelName?: string;
}

/**
 * Webchat v2 — chave do contexto vivo mandado pelo site (texto livre da
 * org). `exists`/`not_exists` ignoram `value`.
 */
export type SiteContextOp = "exists" | "not_exists" | "eq" | "includes";
export interface SiteContextCondition {
  type: "site_context";
  key: string;
  op: SiteContextOp;
  value: string;
}

/** Webchat v2 — evento do site (nome livre) ocorreu/não nos últimos N min. */
export interface SiteEventCondition {
  type: "site_event";
  name: string;
  minutes: number;
  op: "occurred" | "not_occurred";
}

export type TriggerCondition =
  | TagCondition
  | FieldCondition
  | ChannelCondition
  | SiteContextCondition
  | SiteEventCondition;

/** Mesmas regras de nome do backend (`WEBCHAT_CONTEXT_KEY_RE` / `WEBCHAT_EVENT_NAME_RE`). */
export const SITE_CONTEXT_KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
export const SITE_EVENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
/** Janela máxima (365 dias, = retenção máxima). */
export const SITE_EVENT_MAX_MINUTES = 365 * 24 * 60;

const SITE_CONTEXT_OPS: SiteContextOp[] = ["exists", "not_exists", "eq", "includes"];

function asRecord(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Lê `triggerConfig.conditions` (JSON) de forma defensiva. */
export function parseConditions(cfg: unknown): TriggerCondition[] {
  const raw = asRecord(cfg).conditions;
  if (!Array.isArray(raw)) return [];
  const out: TriggerCondition[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    const type = str(r.type);
    if (type === "tag") {
      const tagName = str(r.tagName) || str(r.tagId);
      if (tagName) out.push({ type: "tag", tagName });
    } else if (type === "field") {
      const fieldId = str(r.fieldId);
      if (fieldId) {
        out.push({
          type: "field",
          entity: r.entity === "deal" ? "deal" : "contact",
          fieldId,
          fieldLabel: str(r.fieldLabel) || undefined,
          value: str(r.value),
        });
      }
    } else if (type === "channel") {
      const channelId = str(r.channelId);
      if (channelId) {
        out.push({
          type: "channel",
          channelId,
          channelName: str(r.channelName) || undefined,
        });
      }
    } else if (type === "site_context") {
      const key = str(r.key).trim();
      const op = SITE_CONTEXT_OPS.includes(r.op as SiteContextOp) ? (r.op as SiteContextOp) : "exists";
      if (key) out.push({ type: "site_context", key, op, value: str(r.value) });
    } else if (type === "site_event") {
      const name = str(r.name).trim();
      const minutes = Math.floor(Number(r.minutes));
      if (name) {
        out.push({
          type: "site_event",
          name,
          minutes: Number.isFinite(minutes) && minutes > 0 ? minutes : 60,
          op: r.op === "not_occurred" ? "not_occurred" : "occurred",
        });
      }
    }
  }
  return out;
}

/** Remove condições incompletas antes de persistir. */
export function sanitizeConditions(list: TriggerCondition[]): TriggerCondition[] {
  return list.filter((c) => {
    if (c.type === "tag") return c.tagName.trim().length > 0;
    if (c.type === "field") return c.fieldId.trim().length > 0 && c.value.trim().length > 0;
    if (c.type === "channel") return c.channelId.trim().length > 0;
    if (c.type === "site_context") {
      if (!SITE_CONTEXT_KEY_RE.test(c.key.trim())) return false;
      return c.op === "exists" || c.op === "not_exists" || c.value.trim().length > 0;
    }
    if (c.type === "site_event") {
      return (
        SITE_EVENT_NAME_RE.test(c.name.trim()) &&
        Number.isInteger(c.minutes) &&
        c.minutes >= 1 &&
        c.minutes <= SITE_EVENT_MAX_MINUTES
      );
    }
    return false;
  });
}

/** Comparação estável (ordem-insensível) pro diff do save. */
export function conditionsEqual(
  a: TriggerCondition[] | undefined,
  b: TriggerCondition[] | undefined,
): boolean {
  const sa = sanitizeConditions(a ?? []);
  const sb = sanitizeConditions(b ?? []);
  if (sa.length !== sb.length) return false;
  const key = (c: TriggerCondition): string => {
    if (c.type === "tag") return `tag:${c.tagName}`;
    if (c.type === "field") return `field:${c.entity}:${c.fieldId}:${c.value}`;
    if (c.type === "site_context") return `site_context:${c.key}:${c.op}:${c.value}`;
    if (c.type === "site_event") return `site_event:${c.name}:${c.minutes}:${c.op}`;
    return `channel:${c.channelId}`;
  };
  const ka = sa.map(key).sort();
  const kb = sb.map(key).sort();
  return ka.every((k, i) => k === kb[i]);
}

export function newDefaultCondition(): TriggerCondition {
  return { type: "tag", tagName: "" };
}
