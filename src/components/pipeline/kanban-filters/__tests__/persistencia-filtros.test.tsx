/** @vitest-environment jsdom */
/**
 * L1 — a URL é a fonte da verdade dos filtros/busca do Kanban. O localStorage
 * acompanha a URL (grava e apaga junto) e só devolve o filtro em navegação
 * interna; numa abertura fria com URL limpa nada ressuscita.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetFunnelEntryForTests } from "@/lib/pipeline-entry-navigation";

import { useKanbanFilters } from "../use-kanban-filters";
import { usePipelineSearchSort } from "../use-pipeline-search-sort";

const LS = "kanban-advanced-filters";
const LS_SEARCH = "kanban-pipeline-search:v1";

function setUrl(path: string) {
  window.history.replaceState(null, "", path);
}

/** Simula a carga do documento (Navigation Timing) numa rota. */
function loadedDocumentAt(path: string) {
  vi.spyOn(performance, "getEntriesByType").mockReturnValue([
    { name: `https://crm.example.com${path}` } as PerformanceEntry,
  ]);
}

function mountView() {
  return renderHook(() => ({
    filters: useKanbanFilters(),
    search: usePipelineSearchSort(),
  }));
}

describe("filtros do Kanban: URL manda, localStorage acompanha", () => {
  beforeEach(() => {
    localStorage.clear();
    resetFunnelEntryForTests();
    setUrl("/pipeline");
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("remover os chips apaga a chave e a URL", () => {
    setUrl("/pipeline?tags=t1&dir=in");
    const { result } = mountView();
    expect(result.current.filters.filters.lastMessageDirection).toBe("in");
    expect(JSON.parse(localStorage.getItem(LS) ?? "null")).toMatchObject({
      lastMessageDirection: "in",
    });

    act(() => result.current.filters.patch({ tagIds: undefined, tagMode: undefined }));
    act(() => result.current.filters.patch({ lastMessageDirection: undefined }));

    expect(localStorage.getItem(LS)).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("'Limpar filtros' apaga a chave", () => {
    setUrl("/pipeline?status=OPEN");
    const { result } = mountView();
    expect(localStorage.getItem(LS)).not.toBeNull();
    act(() => result.current.filters.clear());
    expect(localStorage.getItem(LS)).toBeNull();
  });

  it("abertura fria (F5/link) com URL limpa NÃO reaplica filtro nem busca salvos", () => {
    loadedDocumentAt("/pipeline");
    localStorage.setItem(LS, JSON.stringify({ tagIds: ["t1"], lastMessageDirection: "in" }));
    localStorage.setItem(LS_SEARCH, "maria");

    const { result } = mountView();

    expect(result.current.filters.filters).toEqual({});
    expect(result.current.search.search).toBe("");
    expect(window.location.search).toBe("");
    // e já não deixa resíduo para a próxima abertura
    expect(localStorage.getItem(LS)).toBeNull();
    expect(localStorage.getItem(LS_SEARCH)).toBeNull();
  });

  it("sem como distinguir (Navigation Timing indisponível): não reaplica", () => {
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([]);
    localStorage.setItem(LS, JSON.stringify({ lastMessageDirection: "in" }));
    const { result } = mountView();
    expect(result.current.filters.filters).toEqual({});
  });

  it("aplicar filtro → ir ao Inbox → voltar: o filtro é mantido", () => {
    loadedDocumentAt("/pipeline");
    const first = mountView();
    act(() =>
      first.result.current.filters.setFilters({ tagIds: ["t1"], lastMessageDirection: "in" }),
    );
    act(() => first.result.current.search.setSearch("maria"));
    first.unmount(); // navegou para o Inbox
    setUrl("/inbox");
    setUrl("/pipeline"); // voltou com a URL limpa (link da navegação)

    const back = mountView();

    expect(back.result.current.filters.filters).toMatchObject({
      tagIds: ["t1"],
      lastMessageDirection: "in",
    });
    expect(back.result.current.search.search).toBe("maria");
  });

  it("chegou ao funil vindo de outra tela (documento carregado fora do funil): reaplica", () => {
    loadedDocumentAt("/inbox");
    localStorage.setItem(LS, JSON.stringify({ lastMessageDirection: "out" }));
    const { result } = mountView();
    expect(result.current.filters.filters.lastMessageDirection).toBe("out");
  });

  it("remover chip → voltar ao Inbox → voltar ao funil: continua sem filtro", () => {
    loadedDocumentAt("/pipeline");
    setUrl("/pipeline?dir=in");
    const first = mountView();
    act(() => first.result.current.filters.patch({ lastMessageDirection: undefined }));
    first.unmount();
    setUrl("/pipeline");
    const back = mountView();
    expect(back.result.current.filters.filters).toEqual({});
  });
});
