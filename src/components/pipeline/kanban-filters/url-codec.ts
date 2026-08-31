/**
 * Codec dos filtros do Pipeline em parâmetros LEGÍVEIS de URL — estilo Kommo
 * (`?created=today&status=OPEN&owner=...`), no lugar do antigo blob opaco
 * `?f=<base64>`.
 *
 * Motivo: a URL precisa ser copiável, compartilhável e editável à mão. O `f=`
 * continua sendo lido (links antigos e export de CSV) mas nunca mais é escrito.
 *
 * Regras:
 * - Chave ausente = critério inativo. Valor inválido é IGNORADO (nunca quebra
 *   a tela): a view cai no default.
 * - Multi-seleção usa CSV (`owner=abc,def`), com sentinela `none` para os
 *   "sem responsável / sem origem / sem tag".
 * - Datas aceitam preset (`created=today`) ou faixa ISO (`created=2026-08-01..2026-08-14`).
 *   Na escrita, um range que casa exatamente com um preset volta como preset —
 *   é o que mantém `?created=today` estável ao recarregar.
 * - Campos personalizados (raros e estruturados) ficam em base64url (`cf`/`ccf`).
 */

import {
  DATE_PRESET_LABELS,
  dateRangeFromPreset,
  detectPreset,
  type DatePresetKey,
} from "./date-presets";
import {
  SOURCE_NONE,
  type AdvancedDealFilters,
  type CustomFieldFilter,
  type DateRangeValue,
  type DealStatus,
  type TagMode,
} from "./types";
import {
  decodeBool,
  decodeCsv,
  decodeEnum,
  decodeJsonParam,
  decodeNumber,
  decodeRange,
  encodeBool,
  encodeCsv,
  encodeJsonParam,
  encodeRange,
} from "@/lib/url-state";

/** Sentinela textual de "vazio" em params multi-valor. */
const NONE = "none";

/** Todas as chaves que o codec controla — usadas para limpar/detectar. */
export const DEAL_FILTER_URL_KEYS = [
  "name",
  "status",
  "stages",
  "owner",
  "tags",
  "tagmode",
  "source",
  "nosource",
  "lost",
  "created",
  "closed",
  "updated",
  "interaction",
  "value",
  "contact",
  "phone",
  "email",
  "nocontact",
  "conv",
  "window",
  "dir",
  "logic",
  "cf",
  "ccf",
  "exception",
  "stalledDays",
] as const;

/** Param legado com o JSON inteiro em base64url. Só leitura. */
export const LEGACY_FILTERS_PARAM = "f";
/** Atalho para um filtro salvo (`SavedFilter.id`): `?filter=<id>`. */
export const SAVED_FILTER_PARAM = "filter";

const DEAL_STATUSES: readonly DealStatus[] = ["OPEN", "WON", "LOST"];
const TAG_MODES: readonly TagMode[] = ["any", "all", "none"];

/** Aliases aceitos na leitura (inclui os nomes que o Kommo usa). */
const DATE_PRESET_ALIASES: Record<string, DatePresetKey> = {
  current_day: "today",
  hoje: "today",
  ontem: "yesterday",
  "7d": "last_7",
  "15d": "last_15",
  "30d": "last_30",
  current_month: "this_month",
  previous_month: "last_month",
};

function isDatePresetKey(raw: string): raw is DatePresetKey {
  return Object.prototype.hasOwnProperty.call(DATE_PRESET_LABELS, raw);
}

function encodeDateRange(range: DateRangeValue | undefined): string | null {
  if (!range || (!range.from && !range.to)) return null;
  const preset = detectPreset(range);
  if (preset !== "custom" && preset !== "any") return preset;
  return encodeRange(range.from ?? null, range.to ?? null);
}

function decodeDateRange(raw: string | null | undefined): DateRangeValue | undefined {
  if (!raw) return undefined;
  const token = raw.trim().toLowerCase();
  const presetKey = DATE_PRESET_ALIASES[token] ?? (isDatePresetKey(token) ? token : null);
  if (presetKey) return dateRangeFromPreset(presetKey) ?? undefined;
  const range = decodeRange(raw);
  if (!range) return undefined;
  return { from: range.from, to: range.to };
}

/** `["a", null]` → `"a,none"` (null = "sem responsável" na lista). */
function encodeIdsWithNone(
  ids: readonly (string | null)[] | undefined,
  includeNone: boolean,
): string | null {
  const list = (ids ?? []).map((id) => (id == null ? NONE : id));
  if (includeNone && !list.includes(NONE)) list.push(NONE);
  return encodeCsv(list);
}

type DecodedIds = { ids: string[]; none: boolean };

function decodeIdsWithNone(raw: string | null | undefined): DecodedIds {
  const all = decodeCsv(raw);
  const none = all.some((v) => v.toLowerCase() === NONE);
  return { ids: all.filter((v) => v.toLowerCase() !== NONE), none };
}

/**
 * Filtros → patch de params. Chaves com `null` são REMOVIDAS da URL, então o
 * retorno sempre cobre `DEAL_FILTER_URL_KEYS` inteiro (limpa o que saiu).
 */
export function dealFiltersToUrlParams(
  filters: AdvancedDealFilters | null | undefined,
): Record<string, string | null> {
  const f = filters ?? {};
  const sources = (f.sources ?? []).map((s) => (s === SOURCE_NONE ? NONE : s));
  return {
    name: f.search?.trim() ? f.search.trim() : null,
    status: encodeCsv(f.statuses),
    stages: encodeCsv(f.stageIds),
    owner: encodeIdsWithNone(f.ownerIds, f.withoutOwner === true),
    tags: encodeIdsWithNone(f.tagIds, f.withoutTags === true),
    tagmode: f.tagIds?.length && f.tagMode && f.tagMode !== "any" ? f.tagMode : null,
    source: encodeCsv(sources),
    nosource: f.withoutSource ? "1" : null,
    lost: encodeCsv(f.lostReasons),
    created: encodeDateRange(f.createdAt),
    closed: encodeDateRange(f.closedAt),
    updated: encodeDateRange(f.updatedAt),
    interaction: encodeDateRange(f.lastInteractionAt),
    value: encodeRange(f.valueFrom ?? null, f.valueTo ?? null),
    contact: f.contactSearch?.trim() ? f.contactSearch.trim() : null,
    phone: encodeBool(f.contactHasPhone),
    email: encodeBool(f.contactHasEmail),
    nocontact: f.withoutContact ? "1" : null,
    conv: f.conversationStatus ?? null,
    window: f.windowState ?? null,
    dir: f.lastMessageDirection ?? null,
    logic: f.logic === "OR" ? "or" : null,
    cf: encodeJsonParam(f.dealCustomFields?.length ? f.dealCustomFields : null),
    ccf: encodeJsonParam(f.contactCustomFields?.length ? f.contactCustomFields : null),
    exception: f.exception ?? null,
    stalledDays:
      f.exception === "stalled" ? String(f.stalledDays ?? 7) : null,
  };
}

/** A URL carrega algum critério de filtro reconhecido? */
export function hasDealFilterUrlParams(params: URLSearchParams): boolean {
  return DEAL_FILTER_URL_KEYS.some((key) => {
    const v = params.get(key);
    return v != null && v.trim() !== "";
  });
}

/** Params → filtros. Tudo que não for reconhecido é descartado em silêncio. */
export function dealFiltersFromUrlParams(
  params: URLSearchParams,
): AdvancedDealFilters {
  const out: AdvancedDealFilters = {};

  const name = params.get("name")?.trim();
  if (name) out.search = name;

  const statuses = decodeCsv(params.get("status"))
    .map((s) => s.toUpperCase())
    .filter((s): s is DealStatus => (DEAL_STATUSES as readonly string[]).includes(s));
  if (statuses.length) out.statuses = statuses;

  const stageIds = decodeCsv(params.get("stages"));
  if (stageIds.length) out.stageIds = stageIds;

  const owner = decodeIdsWithNone(params.get("owner"));
  if (owner.ids.length) out.ownerIds = owner.ids;
  if (owner.none) out.withoutOwner = true;

  const tags = decodeIdsWithNone(params.get("tags"));
  if (tags.ids.length) out.tagIds = tags.ids;
  if (tags.none) out.withoutTags = true;
  const tagMode = decodeEnum(params.get("tagmode"), TAG_MODES);
  if (tagMode && out.tagIds?.length) out.tagMode = tagMode;

  const sources = decodeCsv(params.get("source")).map((s) =>
    s.toLowerCase() === NONE ? SOURCE_NONE : s,
  );
  if (sources.length) out.sources = sources;
  if (decodeBool(params.get("nosource")) === true) out.withoutSource = true;

  const lostReasons = decodeCsv(params.get("lost"));
  if (lostReasons.length) out.lostReasons = lostReasons;

  const createdAt = decodeDateRange(params.get("created"));
  if (createdAt) out.createdAt = createdAt;
  const closedAt = decodeDateRange(params.get("closed"));
  if (closedAt) out.closedAt = closedAt;
  const updatedAt = decodeDateRange(params.get("updated"));
  if (updatedAt) out.updatedAt = updatedAt;
  const lastInteractionAt = decodeDateRange(params.get("interaction"));
  if (lastInteractionAt) out.lastInteractionAt = lastInteractionAt;

  const value = decodeRange(params.get("value"));
  if (value) {
    const from = decodeNumber(value.from, { min: 0 });
    const to = decodeNumber(value.to, { min: 0 });
    if (from != null) out.valueFrom = from;
    if (to != null) out.valueTo = to;
  }

  const contact = params.get("contact")?.trim();
  if (contact) out.contactSearch = contact;
  const hasPhone = decodeBool(params.get("phone"));
  if (hasPhone !== undefined) out.contactHasPhone = hasPhone;
  const hasEmail = decodeBool(params.get("email"));
  if (hasEmail !== undefined) out.contactHasEmail = hasEmail;
  if (decodeBool(params.get("nocontact")) === true) out.withoutContact = true;

  const conv = decodeEnum(params.get("conv"), ["open", "closed"] as const);
  if (conv) out.conversationStatus = conv;
  const windowState = decodeEnum(params.get("window"), ["open", "closed"] as const);
  if (windowState) out.windowState = windowState;
  const dir = decodeEnum(params.get("dir"), ["in", "out"] as const);
  if (dir) out.lastMessageDirection = dir;

  if (params.get("logic")?.trim().toLowerCase() === "or") out.logic = "OR";

  const cf = decodeJsonParam<CustomFieldFilter[]>(params.get("cf"));
  if (Array.isArray(cf) && cf.length) out.dealCustomFields = cf;
  const ccf = decodeJsonParam<CustomFieldFilter[]>(params.get("ccf"));
  if (Array.isArray(ccf) && ccf.length) out.contactCustomFields = ccf;

  const exception = decodeEnum(params.get("exception"), [
    "no_task",
    "stalled",
    "overdue",
    "empty_value",
  ] as const);
  if (exception) out.exception = exception;
  const stalledDays = decodeNumber(params.get("stalledDays"), { min: 1, max: 365 });
  if (stalledDays != null) out.stalledDays = stalledDays;

  return out;
}
