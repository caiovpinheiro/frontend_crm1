/** @vitest-environment jsdom */
/**
 * KF4 — `GET /api/kanban/filter-options` (~20 mil chamadas em 5,9 dias).
 *
 * Quem pedia sem precisar:
 *  - o campo "Origem" do contato (aside do Inbox e painel do negócio)
 *    buscava as sugestões ao MONTAR — toda conversa/negócio aberto com o
 *    cache vencido (5 min) era um GET, mesmo sem ninguém editar a origem;
 *  - Kanban/Flow/Lista buscavam na montagem sempre que havia filtro salvo.
 *
 * O que fica travado aqui:
 *  - montar o Kanban com filtro ativo não busca; abrir o painel busca;
 *  - reabrir o painel e voltar o foco à janela dentro de 10 min não refaz;
 *  - filtro por campo personalizado busca na montagem (o chip precisa do
 *    rótulo do campo);
 *  - o campo "Origem" só busca quando o usuário começa a editar.
 */
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchFilterOptions: vi.fn() }));
vi.mock("@/components/pipeline/kanban-filters/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/pipeline/kanban-filters/api")>()),
  fetchFilterOptions: api.fetchFilterOptions,
}));
vi.mock("@/hooks/use-my-permissions", () => ({ useCan: () => true }));

import { InlineNativeEditor } from "@/components/crm/fields/inline-native-editor";
import { TooltipProvider } from "@/components/ui/tooltip";
import type {
  AdvancedDealFilters,
  FilterOptionsResponse,
} from "@/components/pipeline/kanban-filters/types";
import {
  FILTER_OPTIONS_STALE_MS,
  filtersNeedOptions,
  useFilterOptions,
} from "@/components/pipeline/kanban-filters/use-filter-options";

const OPTIONS: FilterOptionsResponse = {
  pipelines: [],
  users: [],
  tags: [],
  dealCustomFields: [],
  contactCustomFields: [],
  sources: ["Site", "Indicação"],
};

function client() {
  // Padrões do app (`app/providers.tsx`), menos o retry.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 2 * 60_000, refetchOnWindowFocus: false },
    },
  });
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <TooltipProvider>{children}</TooltipProvider>
      </QueryClientProvider>
    );
  };
}

async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  api.fetchFilterOptions.mockReset();
  api.fetchFilterOptions.mockResolvedValue(OPTIONS);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Mesma ligação das telas: painel fechado/aberto + filtros ativos. */
function usePanel(props: { open: boolean; filters: AdvancedDealFilters }) {
  return useFilterOptions(props.open || filtersNeedOptions(props.filters));
}

describe("opções de filtro do Kanban", () => {
  it("montar com filtro ativo não busca; abrir o painel busca uma vez", async () => {
    const qc = client();
    const view = renderHook(usePanel, {
      wrapper: wrap(qc),
      initialProps: { open: false, filters: { tagIds: ["t1"], sources: ["Site"] } },
    });
    await flush();
    expect(api.fetchFilterOptions).not.toHaveBeenCalled();

    view.rerender({ open: true, filters: { tagIds: ["t1"], sources: ["Site"] } });
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);
    expect(view.result.current.data).toEqual(OPTIONS);
  });

  it("reabrir o painel, remontar a tela e voltar o foco dentro de 10 min não refaz", async () => {
    const qc = client();
    const props = { open: true, filters: {} as AdvancedDealFilters };
    const view = renderHook(usePanel, { wrapper: wrap(qc), initialProps: props });
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 5; i += 1) {
      view.rerender({ ...props, open: false });
      await flush(60_000);
      view.rerender({ ...props, open: true });
      await flush();
    }
    // Outra tela (Flow/Lista) montando com o painel aberto: mesmo cache.
    renderHook(usePanel, { wrapper: wrap(qc), initialProps: props });
    await flush();
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);

    // Depois de 10 min o cache venceu: a próxima abertura atualiza.
    view.rerender({ ...props, open: false });
    await flush(FILTER_OPTIONS_STALE_MS);
    view.rerender({ ...props, open: true });
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(2);
    focusManager.setFocused(undefined);
  });

  it("filtro por campo personalizado busca na montagem (rótulo do chip)", async () => {
    expect(filtersNeedOptions({ tagIds: ["t1"], ownerIds: ["u1"], search: "maria" })).toBe(false);
    expect(filtersNeedOptions({})).toBe(false);
    expect(filtersNeedOptions({ dealCustomFields: [{ name: "curso", value: "x" }] })).toBe(true);
    expect(filtersNeedOptions({ contactCustomFields: [{ name: "cpf", value: "1" }] })).toBe(true);

    const qc = client();
    renderHook(usePanel, {
      wrapper: wrap(qc),
      initialProps: {
        open: false,
        filters: { dealCustomFields: [{ name: "curso", value: "x" }] },
      },
    });
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);
  });
});

describe("campo Origem do contato (aside do Inbox / painel do negócio)", () => {
  function Field() {
    return (
      <InlineNativeEditor
        value=""
        entityType="contact"
        entityId="c1"
        fieldKey="source"
        suggestionsFrom="contact-sources"
      />
    );
  }

  it("abrir 20 conversas não busca; só ao editar a origem", async () => {
    const qc = client();
    for (let i = 0; i < 20; i += 1) {
      const view = render(<Field />, { wrapper: wrap(qc) });
      await flush(6 * 60_000);
      view.unmount();
    }
    expect(api.fetchFilterOptions).not.toHaveBeenCalled();

    const view = render(<Field />, { wrapper: wrap(qc) });
    await flush();
    fireEvent.click(view.getByRole("button", { name: "Editar source" }));
    await flush();
    expect(api.fetchFilterOptions).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain("Indicação");
  });
});
