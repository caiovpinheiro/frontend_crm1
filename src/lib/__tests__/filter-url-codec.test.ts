/**
 * Round-trip dos filtros compartilháveis na URL (Inbox e Pipeline).
 *
 * Cobre o contrato que o link precisa honrar: o que é escrito na URL volta como
 * o mesmo recorte, e valor inválido é ignorado (cai no default) em vez de
 * quebrar a tela.
 */

import { describe, expect, it } from "vitest";

import {
  dealFiltersFromUrlParams,
  dealFiltersToUrlParams,
  hasDealFilterUrlParams,
} from "@/components/pipeline/kanban-filters/url-codec";
import { dateRangeFromPreset } from "@/components/pipeline/kanban-filters/date-presets";
import type { AdvancedDealFilters } from "@/components/pipeline/kanban-filters/types";
import {
  hasInboxUrlState,
  inboxFiltersFromUrlParams,
  inboxFiltersToUrlParams,
} from "@/features/inbox-v2/hooks/use-inbox-filters-url-sync";
import type { InboxFilters } from "@/features/inbox-v2/api/types";

function toParams(patch: Record<string, string | null>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(patch)) {
    if (value != null && value !== "") params.set(key, value);
  }
  return params;
}

describe("URL dos filtros do Pipeline", () => {
  it("faz round-trip dos critérios do funil", () => {
    const filters: AdvancedDealFilters = {
      search: "maria",
      statuses: ["OPEN", "WON"],
      stageIds: ["stage_a", "stage_b"],
      ownerIds: ["user_1"],
      tagIds: ["tag_1"],
      tagMode: "all",
      sources: ["site", "__none__"],
      lostReasons: ["Preço"],
      valueFrom: 100,
      valueTo: 5000,
      contactSearch: "5511",
      contactHasPhone: true,
      withoutContact: true,
      conversationStatus: "open",
      windowState: "closed",
      lastMessageDirection: "in",
    };
    expect(dealFiltersFromUrlParams(toParams(dealFiltersToUrlParams(filters)))).toEqual(
      filters,
    );
  });

  it("escreve 'sem responsável' e 'sem tag' como sentinela none", () => {
    const params = dealFiltersToUrlParams({ withoutOwner: true, withoutTags: true });
    expect(params.owner).toBe("none");
    expect(params.tags).toBe("none");
    const back = dealFiltersFromUrlParams(toParams(params));
    expect(back).toEqual({ withoutOwner: true, withoutTags: true });
  });

  it("mantém 'criado hoje' como preset legível na URL", () => {
    const today = dateRangeFromPreset("today");
    expect(dealFiltersToUrlParams({ createdAt: today ?? undefined }).created).toBe("today");
    expect(dealFiltersFromUrlParams(toParams({ created: "today" })).createdAt).toEqual(today);
    // Alias do Kommo.
    expect(dealFiltersFromUrlParams(toParams({ created: "current_day" })).createdAt).toEqual(
      today,
    );
  });

  it("aceita faixa de datas explícita e faixa de valor aberta", () => {
    expect(
      dealFiltersFromUrlParams(toParams({ created: "2026-08-01..2026-08-14" })).createdAt,
    ).toEqual({ from: "2026-08-01", to: "2026-08-14" });
    expect(dealFiltersFromUrlParams(toParams({ value: "..500" }))).toEqual({ valueTo: 500 });
  });

  it("ignora valor inválido em vez de quebrar", () => {
    const back = dealFiltersFromUrlParams(
      toParams({ status: "BANANA", conv: "talvez", value: "abc..xyz", tagmode: "??" }),
    );
    expect(back).toEqual({});
    expect(hasDealFilterUrlParams(toParams({ status: "OPEN" }))).toBe(true);
    expect(hasDealFilterUrlParams(toParams({ window: "closed" }))).toBe(true);
    expect(hasDealFilterUrlParams(toParams({ deal: "68626" }))).toBe(false);
  });
});

describe("URL dos filtros do Inbox", () => {
  it("faz round-trip dos critérios da caixa de entrada", () => {
    const filters: InboxFilters = {
      ownerIds: ["user_1", "user_2"],
      channelIds: ["chan_1"],
      stageIds: ["stage_1"],
      tagIds: ["tag_1"],
      sources: ["site", "__none__"],
      windowState: "open",
      sessionExpiresWithinHours: 2,
      lastMessageDirection: "out",
      sortBy: "unreadCount",
      sortOrder: "desc",
    };
    const back = inboxFiltersFromUrlParams(toParams(inboxFiltersToUrlParams(filters)));
    expect(back).toMatchObject(filters);
  });

  it("codifica 'sem responsável' como none e a ordenação como sort", () => {
    expect(inboxFiltersToUrlParams({ withoutOwner: true }).owner).toBe("none");
    expect(inboxFiltersFromUrlParams(toParams({ owner: "none" }))).toMatchObject({
      withoutOwner: true,
    });
    // Ordenação default não suja a URL.
    expect(
      inboxFiltersToUrlParams({ sortBy: "lastInboundAt", sortOrder: "desc" }).sort,
    ).toBeNull();
    expect(inboxFiltersFromUrlParams(toParams({ sort: "oldest" }))).toMatchObject({
      sortBy: "lastInboundAt",
      sortOrder: "asc",
    });
  });

  it("ignora sessão fora da faixa e enum desconhecido", () => {
    expect(
      inboxFiltersFromUrlParams(toParams({ expires: "99", window: "meio-aberta", sort: "xyz" })),
    ).toEqual(inboxFiltersFromUrlParams(new URLSearchParams()));
  });

  it("reconhece aba/busca/filtro na URL e ignora só o deep-link de conversa", () => {
    expect(hasInboxUrlState(toParams({ tab: "todos" }))).toBe(true);
    expect(hasInboxUrlState(toParams({ tab: "entrada,esperando" }))).toBe(true);
    expect(hasInboxUrlState(toParams({ tab: "esperando" }))).toBe(true);
    expect(hasInboxUrlState(toParams({ q: "maria" }))).toBe(true);
    expect(hasInboxUrlState(toParams({ window: "closed" }))).toBe(true);
    expect(hasInboxUrlState(toParams({ c: "50424" }))).toBe(false);
    expect(hasInboxUrlState(toParams({ tab: "inexistente" }))).toBe(false);
  });
});
