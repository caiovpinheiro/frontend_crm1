/**
 * Forma canônica dos filtros avançados.
 *
 * O mesmo recorte chega por caminhos diferentes (chip, modal, URL, filtro
 * salvo, localStorage) com as chaves em outra ordem, ids em outra ordem e
 * campos vazios/padrão sobrando. Sem normalizar, cada variação virava uma
 * chave de query diferente — e um POST novo do board para o mesmo resultado.
 *
 * `canonicalFilters` devolve o objeto equivalente: chaves em ordem
 * alfabética, listas de ids ordenadas e sem repetição, sem campos vazios
 * nem valores que o backend já assume por padrão.
 */
import type {
  AdvancedDealFilters,
  CustomFieldFilter,
  DateRangeValue,
} from "./types";

/** `false` nestes campos é o mesmo que ausente. */
const FALSE_IS_DEFAULT = new Set<keyof AdvancedDealFilters>([
  "withoutOwner",
  "withoutContact",
  "withoutSource",
  "withoutUtmSource",
  "withoutTags",
  "showAllStages",
]);

/** Listas em que a ordem não muda o resultado. */
const UNORDERED_LISTS = new Set<keyof AdvancedDealFilters>([
  "stageIds",
  "statuses",
  "ownerIds",
  "sources",
  "utmSources",
  "lostReasons",
  "tagIds",
]);

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `null` (ex.: "sem responsável" em `ownerIds`) ordena antes das strings. */
function sortedUnique<T extends string | null>(list: readonly T[]): T[] {
  const seen = new Set<T>();
  for (const item of list) {
    if (item === null || typeof item === "string") seen.add(item);
  }
  return [...seen].sort((a, b) =>
    a === null ? (b === null ? 0 : -1) : b === null ? 1 : compare(a, b),
  );
}

function canonicalRange(range: DateRangeValue | null | undefined): DateRangeValue | undefined {
  if (!range || typeof range !== "object") return undefined;
  const out: DateRangeValue = {};
  if (range.from) out.from = range.from;
  if (range.to) out.to = range.to;
  return out.from || out.to ? out : undefined;
}

function canonicalCustomField(cf: CustomFieldFilter): CustomFieldFilter | null {
  if (!cf || typeof cf.name !== "string" || !cf.name) return null;
  const out: CustomFieldFilter = { name: cf.name };
  if (cf.operator) out.operator = cf.operator;
  const value = cf.value;
  if (Array.isArray(value)) {
    out.value = sortedUnique(value);
  } else if (value && typeof value === "object") {
    const range = canonicalRange(value);
    if (range) out.value = range;
  } else if (value !== undefined && value !== null && value !== "") {
    out.value = value;
  }
  return out;
}

function canonicalCustomFields(list: readonly CustomFieldFilter[]): CustomFieldFilter[] {
  return list
    .map(canonicalCustomField)
    .filter((cf): cf is CustomFieldFilter => cf !== null)
    .map((cf) => ({ cf, key: JSON.stringify([cf.name, cf.operator ?? "", cf.value ?? null]) }))
    .sort((a, b) => compare(a.key, b.key))
    .map((item) => item.cf);
}

export function canonicalFilters(
  filters: AdvancedDealFilters | null | undefined,
): AdvancedDealFilters {
  if (!filters) return {};
  const out: Record<string, unknown> = {};
  const keys = (Object.keys(filters) as (keyof AdvancedDealFilters)[]).sort(compare);
  for (const key of keys) {
    const value = filters[key];
    if (value === undefined || value === null) continue;
    if (value === false && FALSE_IS_DEFAULT.has(key)) continue;
    if (typeof value === "string") {
      const text = value.trim();
      if (text) out[key] = text;
      continue;
    }
    if (key === "dealCustomFields" || key === "contactCustomFields") {
      const list = canonicalCustomFields(value as CustomFieldFilter[]);
      if (list.length > 0) out[key] = list;
      continue;
    }
    if (Array.isArray(value)) {
      const list = UNORDERED_LISTS.has(key)
        ? sortedUnique(value as (string | null)[])
        : [...value];
      if (list.length > 0) out[key] = list;
      continue;
    }
    if (typeof value === "object") {
      const range = canonicalRange(value as DateRangeValue);
      if (range) out[key] = range;
      continue;
    }
    out[key] = value;
  }
  // Padrões do backend: `logic` AND; `tagMode` "any" e só vale com tags.
  if (out.logic === "AND") delete out.logic;
  if (out.tagMode === "any" || !out.tagIds) delete out.tagMode;
  return out as AdvancedDealFilters;
}

/** Chave estável: filtros equivalentes dão a mesma string. */
export function canonicalFiltersKey(
  filters: AdvancedDealFilters | null | undefined,
): string {
  return JSON.stringify(canonicalFilters(filters));
}
