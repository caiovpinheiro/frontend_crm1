/**
 * Webchat v2 — config do canal no painel (`Channel.config.v2`) e segredos.
 *
 * Espelho do backend (`src/lib/webchat/v2-config.ts` e `secrets.ts`).
 * Contrato: `backend_crm1/docs/decisoes/webchat-widget.md` §9.5 e §9.7 — o
 * backend valida de verdade (PUT devolve 400 `{ message }`); aqui só lemos
 * com tolerância e limitamos os números às faixas.
 */
import { apiUrl } from "@/lib/api";

export const WEBCHAT_CONTEXT_KEY_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;
export const WEBCHAT_EVENT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
export const WEBCHAT_ATTRIBUTE_RE = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,63}$/;

export const WEBCHAT_V2_LIMITS = {
  contextMaxKeys: { min: 1, def: 30, max: 100 },
  contextMaxValueChars: { min: 1, def: 200, max: 1000 },
  eventsMaxPerBatch: { min: 1, def: 20, max: 50 },
  eventsRetentionDays: { min: 1, def: 30, max: 365 },
} as const;

export type WebchatMatchField =
  | { type: "externalId" }
  | { type: "customField"; customFieldId: string };

export type WebchatAttributeMapping = { attribute: string; customFieldId: string };

export type WebchatRoutingRule = {
  category?: string;
  priority?: string;
  tagId?: string;
  departmentId?: string;
  pinNote?: boolean;
};

export type WebchatV2Config = {
  identity: { matchField: WebchatMatchField; attributeMap: WebchatAttributeMapping[] };
  context: {
    labels: Record<string, string>;
    maxKeys: number;
    maxValueChars: number;
    anonymous: boolean;
  };
  events: {
    maxPerBatch: number;
    retentionDays: number;
    important: string[];
    importantOpensConversation: boolean;
  };
  s2s: { queueTagId: string | null; callbackUrl: string | null; rules: WebchatRoutingRule[] };
  refDealCustomFieldId: string | null;
};

export type WebchatSecretKind = "identity" | "s2s";
export type WebchatSecretStatus = { configured: boolean; rotatedAt: string | null };
export type WebchatSecretsStatus = Record<WebchatSecretKind, WebchatSecretStatus>;

export const EMPTY_WEBCHAT_SECRETS: WebchatSecretsStatus = {
  identity: { configured: false, rotatedAt: null },
  s2s: { configured: false, rotatedAt: null },
};

export function defaultWebchatV2Config(): WebchatV2Config {
  const L = WEBCHAT_V2_LIMITS;
  return {
    identity: { matchField: { type: "externalId" }, attributeMap: [] },
    context: {
      labels: {},
      maxKeys: L.contextMaxKeys.def,
      maxValueChars: L.contextMaxValueChars.def,
      anonymous: false,
    },
    events: {
      maxPerBatch: L.eventsMaxPerBatch.def,
      retentionDays: L.eventsRetentionDays.def,
      important: [],
      importantOpensConversation: false,
    },
    s2s: { queueTagId: null, callbackUrl: null, rules: [] },
    refDealCustomFieldId: null,
  };
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Inteiro dentro da faixa (fora/inválido → `fallback`). */
export function clampInt(v: unknown, range: { min: number; max: number }, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, Math.round(n)));
}

/** Lê `config.v2` como o backend gravou (tolerante; o que falta = default). */
export function readWebchatV2Config(config: unknown): WebchatV2Config {
  const d = defaultWebchatV2Config();
  const raw = isObj(config) && isObj(config.v2) ? config.v2 : {};
  const identity = isObj(raw.identity) ? raw.identity : {};
  const context = isObj(raw.context) ? raw.context : {};
  const events = isObj(raw.events) ? raw.events : {};
  const s2s = isObj(raw.s2s) ? raw.s2s : {};
  const L = WEBCHAT_V2_LIMITS;

  const mf = isObj(identity.matchField) ? identity.matchField : {};
  const matchField: WebchatMatchField =
    mf.type === "customField" && str(mf.customFieldId)
      ? { type: "customField", customFieldId: str(mf.customFieldId)! }
      : { type: "externalId" };

  const attributeMap = Array.isArray(identity.attributeMap)
    ? identity.attributeMap.flatMap((r) =>
        isObj(r) && str(r.attribute) && str(r.customFieldId)
          ? [{ attribute: str(r.attribute)!, customFieldId: str(r.customFieldId)! }]
          : [],
      )
    : [];

  const labels: Record<string, string> = {};
  if (isObj(context.labels)) {
    for (const [k, v] of Object.entries(context.labels)) if (str(v)) labels[k] = str(v)!;
  }

  const rules = Array.isArray(s2s.rules)
    ? s2s.rules.flatMap((r) => {
        if (!isObj(r)) return [];
        const rule: WebchatRoutingRule = {};
        if (str(r.category)) rule.category = str(r.category)!;
        if (str(r.priority)) rule.priority = str(r.priority)!;
        if (str(r.tagId)) rule.tagId = str(r.tagId)!;
        if (str(r.departmentId)) rule.departmentId = str(r.departmentId)!;
        if (r.pinNote === true) rule.pinNote = true;
        return [rule];
      })
    : [];

  return {
    identity: { matchField, attributeMap },
    context: {
      labels,
      maxKeys: clampInt(context.maxKeys, L.contextMaxKeys, d.context.maxKeys),
      maxValueChars: clampInt(context.maxValueChars, L.contextMaxValueChars, d.context.maxValueChars),
      anonymous: context.anonymous === true,
    },
    events: {
      maxPerBatch: clampInt(events.maxPerBatch, L.eventsMaxPerBatch, d.events.maxPerBatch),
      retentionDays: clampInt(events.retentionDays, L.eventsRetentionDays, d.events.retentionDays),
      important: Array.isArray(events.important)
        ? events.important.filter((n): n is string => typeof n === "string" && n.length > 0)
        : [],
      importantOpensConversation: events.importantOpensConversation === true,
    },
    s2s: {
      queueTagId: str(s2s.queueTagId),
      callbackUrl: str(s2s.callbackUrl),
      rules,
    },
    refDealCustomFieldId: str(raw.refDealCustomFieldId),
  };
}

/** Status dos segredos que vem no canal (`webchatSecrets`) — tolerante. */
export function readWebchatSecretsStatus(raw: unknown): WebchatSecretsStatus {
  const one = (v: unknown): WebchatSecretStatus =>
    isObj(v) && v.configured === true
      ? { configured: true, rotatedAt: typeof v.rotatedAt === "string" ? v.rotatedAt : null }
      : { configured: false, rotatedAt: null };
  return isObj(raw) ? { identity: one(raw.identity), s2s: one(raw.s2s) } : EMPTY_WEBCHAT_SECRETS;
}

/**
 * `POST /api/channels/:id/webchat-secrets/:kind` — gera ou gira. O valor
 * volta só nesta resposta (mostrar uma vez, nunca guardar).
 */
export async function rotateWebchatSecret(
  channelId: string,
  kind: WebchatSecretKind,
): Promise<{ secret: string; rotatedAt: string; secrets: WebchatSecretsStatus }> {
  const res = await fetch(
    apiUrl(`/api/channels/${encodeURIComponent(channelId)}/webchat-secrets/${kind}`),
    { method: "POST", cache: "no-store" },
  );
  const data = (await res.json().catch(() => ({}))) as {
    message?: string;
    secret?: string;
    rotatedAt?: string;
    secrets?: unknown;
  };
  if (!res.ok || typeof data.secret !== "string") {
    throw new Error(data.message ?? "Erro ao gerar a chave.");
  }
  return {
    secret: data.secret,
    rotatedAt: data.rotatedAt ?? new Date().toISOString(),
    secrets: readWebchatSecretsStatus(data.secrets),
  };
}

/** Props comuns das seções v2 do painel (uma por frente). */
export type WebchatV2SectionProps = {
  channelId: string;
  publicKey: string | null;
  value: WebchatV2Config;
  onChange: (next: WebchatV2Config) => void;
  secrets: WebchatSecretsStatus;
  onSecretsChange: (next: WebchatSecretsStatus) => void;
};

/**
 * O que vai no `PUT`: descarta linhas incompletas que o backend recusaria
 * (atributo sem campo, regra sem critério ou sem ação, rótulo vazio).
 */
export function prepareWebchatV2ForSave(v2: WebchatV2Config): WebchatV2Config {
  const labels: Record<string, string> = {};
  for (const [k, t] of Object.entries(v2.context.labels)) {
    if (WEBCHAT_CONTEXT_KEY_RE.test(k) && t.trim()) labels[k] = t.trim();
  }
  return {
    ...v2,
    identity: {
      ...v2.identity,
      attributeMap: v2.identity.attributeMap.filter(
        (r) => WEBCHAT_ATTRIBUTE_RE.test(r.attribute) && r.customFieldId,
      ),
    },
    context: { ...v2.context, labels },
    s2s: {
      ...v2.s2s,
      callbackUrl: v2.s2s.callbackUrl?.trim() || null,
      rules: v2.s2s.rules.filter(
        (r) => (r.category?.trim() || r.priority?.trim()) && (r.tagId || r.departmentId || r.pinNote),
      ),
    },
  };
}
