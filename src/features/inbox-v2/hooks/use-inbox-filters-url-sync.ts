/**
 * Aba, busca e filtros do Inbox na URL — link copiável/compartilhável.
 *
 * `/inbox?tab=esperando&q=maria&owner=<id>&window=open&created=...` no lugar do
 * estado invisível em localStorage. A URL é a fonte da verdade no F5 e no
 * voltar/avançar; o localStorage segue como fallback de quem abre `/inbox`
 * limpo (mantém a última visão do operador, comportamento antigo).
 *
 * Escrita via History API (igual ao deep-link `?c=`), nunca `router.replace`:
 * a página é RSC e o replace do App Router refaz o payload do servidor a cada
 * tecla digitada.
 *
 * Valor inválido é ignorado em silêncio → cai no default (nunca trava a tela).
 */

"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";

import {
  applyUrlParams,
  decodeCsv,
  decodeEnum,
  decodeNumber,
  decodeRange,
  encodeCsv,
  encodeRange,
  readLiveParams,
  useUrlPopstate,
} from "@/lib/url-state";

import type { InboxFilters, InboxTab } from "../api";
import { hasInboxServerFilters, normalizeInboxFilters } from "../api/types";

/** Sentinela de "sem responsável / sem origem" nos params multi-valor. */
const NONE = "none";
/** Sentinela do backend para contatos sem origem. */
const SOURCE_NONE = "__none__";
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export const INBOX_TAB_IDS = [
  "todos",
  "entrada",
  "esperando",
  "respondidas",
  "ligar",
  "agente_ia",
  "automacao",
  "finalizados",
  "erro",
] as const satisfies readonly InboxTab[];

export const DEFAULT_INBOX_TAB: InboxTab = "esperando";

const INBOX_TAB_STORAGE_KEY = "inbox-v2:tab";
const INBOX_FILTERS_STORAGE_KEY = "inbox-v2:filters";

const TAB_PARAM = "tab";
const SEARCH_PARAM = "q";

/** Params de filtro (fora de `tab`/`q`) controlados por este hook. */
const FILTER_PARAMS = [
  "owner",
  "channel",
  "stage",
  "tag",
  "source",
  "window",
  "expires",
  "dir",
  "sort",
  "last",
  "created",
  "painel",
] as const;

/** Ordenações da lista (espelha SORT_OPTIONS do painel de filtros). */
const SORT_IDS = ["recent", "oldest", "unread"] as const;
type SortId = (typeof SORT_IDS)[number];

const SORT_BY_ID: Record<SortId, { sortBy: string; sortOrder: "asc" | "desc" }> = {
  recent: { sortBy: "lastInboundAt", sortOrder: "desc" },
  oldest: { sortBy: "lastInboundAt", sortOrder: "asc" },
  unread: { sortBy: "unreadCount", sortOrder: "desc" },
};

function sortIdFromFilters(f: InboxFilters): SortId {
  if (f.sortBy === "unreadCount") return "unread";
  if (f.sortBy === "lastInboundAt" && f.sortOrder === "asc") return "oldest";
  return "recent";
}

export function isInboxTab(raw: string | null | undefined): raw is InboxTab {
  return !!raw && (INBOX_TAB_IDS as readonly string[]).includes(raw);
}

// ── localStorage (fallback quando a URL vem sem filtros) ─────────────

function readStoredTab(): InboxTab {
  try {
    const raw = localStorage.getItem(INBOX_TAB_STORAGE_KEY);
    if (isInboxTab(raw)) return raw;
  } catch {
    /* localStorage indisponível */
  }
  return DEFAULT_INBOX_TAB;
}

function writeStoredTab(tab: InboxTab) {
  try {
    localStorage.setItem(INBOX_TAB_STORAGE_KEY, tab);
  } catch {
    /* localStorage indisponível */
  }
}

function readStoredFilters(): InboxFilters {
  try {
    const raw = localStorage.getItem(INBOX_FILTERS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return normalizeInboxFilters(parsed as InboxFilters);
  } catch {
    return {};
  }
}

function writeStoredFilters(filters: InboxFilters) {
  try {
    const normalized = normalizeInboxFilters(filters);
    const empty =
      !hasInboxServerFilters(normalized) &&
      !normalized.sortBy &&
      !normalized.sortOrder &&
      !normalized.windowState &&
      !normalized.lastMessageDirection &&
      !normalized.lastMessageFrom &&
      !normalized.lastMessageTo &&
      !normalized.createdFrom &&
      !normalized.createdTo;
    if (empty) {
      localStorage.removeItem(INBOX_FILTERS_STORAGE_KEY);
      return;
    }
    localStorage.setItem(INBOX_FILTERS_STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    /* localStorage indisponível */
  }
}

// ── codec ────────────────────────────────────────────────────────────

export function inboxFiltersToUrlParams(
  filters: InboxFilters,
): Record<string, string | null> {
  const f = normalizeInboxFilters(filters);
  const owners = [...(f.ownerIds ?? [])];
  if (f.withoutOwner) owners.push(NONE);
  const sources = (f.sources ?? []).map((s) => (s === SOURCE_NONE ? NONE : s));
  const sort = sortIdFromFilters(f);
  return {
    owner: encodeCsv(owners),
    channel: encodeCsv(f.channelIds),
    stage: encodeCsv(f.stageIds),
    tag: encodeCsv(f.tagIds),
    source: encodeCsv(sources),
    window: f.windowState ?? null,
    expires: f.sessionExpiresWithinHours != null ? String(f.sessionExpiresWithinHours) : null,
    dir: f.lastMessageDirection ?? null,
    sort: sort === "recent" ? null : sort,
    last: encodeRange(f.lastMessageFrom, f.lastMessageTo),
    created: encodeRange(f.createdFrom, f.createdTo),
    painel: f.painelException ?? null,
  };
}

export function inboxFiltersFromUrlParams(params: URLSearchParams): InboxFilters {
  const out: InboxFilters = {};

  const owners = decodeCsv(params.get("owner"));
  const ownerIds = owners.filter((v) => v.toLowerCase() !== NONE);
  if (owners.some((v) => v.toLowerCase() === NONE)) out.withoutOwner = true;
  else if (ownerIds.length) out.ownerIds = ownerIds;

  const channelIds = decodeCsv(params.get("channel"));
  if (channelIds.length) out.channelIds = channelIds;
  const stageIds = decodeCsv(params.get("stage"));
  if (stageIds.length) out.stageIds = stageIds;
  const tagIds = decodeCsv(params.get("tag"));
  if (tagIds.length) out.tagIds = tagIds;

  const sources = decodeCsv(params.get("source")).map((s) =>
    s.toLowerCase() === NONE ? SOURCE_NONE : s,
  );
  if (sources.length) out.sources = sources;

  const windowState = decodeEnum(params.get("window"), ["open", "closed"] as const);
  if (windowState) out.windowState = windowState;

  const expires = decodeNumber(params.get("expires"), { min: 0.1, max: 23.9 });
  if (expires != null) out.sessionExpiresWithinHours = expires;

  const dir = decodeEnum(params.get("dir"), ["in", "out"] as const);
  if (dir) out.lastMessageDirection = dir;

  const sort = decodeEnum(params.get("sort"), SORT_IDS);
  if (sort && sort !== "recent") {
    out.sortBy = SORT_BY_ID[sort].sortBy;
    out.sortOrder = SORT_BY_ID[sort].sortOrder;
  }

  const last = decodeRange(params.get("last"));
  if (last?.from && ISO_DAY.test(last.from)) out.lastMessageFrom = last.from;
  if (last?.to && ISO_DAY.test(last.to)) out.lastMessageTo = last.to;
  const created = decodeRange(params.get("created"));
  if (created?.from && ISO_DAY.test(created.from)) out.createdFrom = created.from;
  if (created?.to && ISO_DAY.test(created.to)) out.createdTo = created.to;

  const painel = decodeEnum(params.get("painel"), [
    "no_reply",
    "open_24h",
    "unassigned",
    "send_failure",
  ] as const);
  if (painel) out.painelException = painel;

  return normalizeInboxFilters(out);
}

/** A URL já descreve uma visão do Inbox (aba, busca ou filtro)? */
export function hasInboxUrlState(params: URLSearchParams): boolean {
  if (isInboxTab(params.get(TAB_PARAM))) return true;
  if ((params.get(SEARCH_PARAM) ?? "").trim()) return true;
  return FILTER_PARAMS.some((key) => (params.get(key) ?? "").trim() !== "");
}

/** Link compartilhável da visão atual do Inbox. */
export function inboxViewHref(
  tab: InboxTab,
  filters: InboxFilters,
  search?: string,
): string {
  const params = new URLSearchParams();
  params.set(TAB_PARAM, tab);
  const q = (search ?? "").trim();
  if (q) params.set(SEARCH_PARAM, q);
  for (const [key, value] of Object.entries(inboxFiltersToUrlParams(filters))) {
    if (value != null && value !== "") params.set(key, value);
  }
  return `/inbox?${params.toString()}`;
}

// ── hook ─────────────────────────────────────────────────────────────

export type UseInboxFilterUrlStateResult = {
  tab: InboxTab;
  setTab: (next: SetStateAction<InboxTab>) => void;
  /** Troca a aba sem empilhar histórico (deep-link / hidratação). */
  replaceTab: (next: InboxTab) => void;
  /** Aba já resolvida (URL/localStorage) — trava o fetch da lista até então. */
  tabHydrated: boolean;
  filters: InboxFilters;
  setFilters: (next: SetStateAction<InboxFilters>) => void;
  filtersHydrated: boolean;
  search: string;
  setSearch: (next: string) => void;
};

export function useInboxFilterUrlState(): UseInboxFilterUrlStateResult {
  const [tab, setTabState] = useState<InboxTab>(DEFAULT_INBOX_TAB);
  const [filters, setFiltersState] = useState<InboxFilters>({});
  const [search, setSearchState] = useState("");
  const [hydrated, setHydrated] = useState(false);
  // Só clique do usuário empilha histórico (o Voltar desfaz o filtro);
  // hidratação e popstate reescrevem no lugar.
  const userEdit = useRef(false);

  // useLayoutEffect: restaura ANTES do paint (com useEffect a lista piscava
  // um frame com a aba default vazia no F5).
  useLayoutEffect(() => {
    const params = readLiveParams();
    if (hasInboxUrlState(params)) {
      const urlTab = params.get(TAB_PARAM);
      setTabState(isInboxTab(urlTab) ? urlTab : DEFAULT_INBOX_TAB);
      setFiltersState(inboxFiltersFromUrlParams(params));
      setSearchState(params.get(SEARCH_PARAM) ?? "");
    } else {
      setTabState(readStoredTab());
      setFiltersState(readStoredFilters());
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // `filter` só existe no atalho `/inbox/filter/<id>`: some da URL depois de
    // hidratar (o Inbox ainda não tem filtros salvos).
    applyUrlParams(
      { [TAB_PARAM]: tab, filter: null },
      userEdit.current ? "push" : "replace",
    );
    writeStoredTab(tab);
  }, [tab, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    applyUrlParams(
      inboxFiltersToUrlParams(filters),
      userEdit.current ? "push" : "replace",
    );
    writeStoredFilters(filters);
  }, [filters, hydrated]);

  // Busca: `replace` sempre — digitar não pode empilhar uma entrada de
  // histórico por caractere.
  useEffect(() => {
    if (!hydrated) return;
    applyUrlParams({ [SEARCH_PARAM]: search.trim() || null }, "replace");
  }, [search, hydrated]);

  const onPop = useCallback(() => {
    const params = readLiveParams();
    userEdit.current = false;
    const urlTab = params.get(TAB_PARAM);
    setTabState(isInboxTab(urlTab) ? urlTab : DEFAULT_INBOX_TAB);
    setFiltersState(inboxFiltersFromUrlParams(params));
    setSearchState(params.get(SEARCH_PARAM) ?? "");
  }, []);
  useUrlPopstate(onPop);

  const setTab = useCallback((next: SetStateAction<InboxTab>) => {
    userEdit.current = true;
    setTabState(next);
  }, []);

  const replaceTab = useCallback((next: InboxTab) => {
    userEdit.current = false;
    setTabState(next);
  }, []);

  const setFilters = useCallback((next: SetStateAction<InboxFilters>) => {
    userEdit.current = true;
    setFiltersState(next);
  }, []);

  const setSearch = useCallback((next: string) => {
    setSearchState(next);
  }, []);

  return {
    tab,
    setTab,
    replaceTab,
    tabHydrated: hydrated,
    filters,
    setFilters,
    filtersHydrated: hydrated,
    search,
    setSearch,
  };
}
