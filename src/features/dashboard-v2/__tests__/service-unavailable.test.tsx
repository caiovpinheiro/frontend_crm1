/** @vitest-environment jsdom */
/**
 * D1 — seções de /api/painel/service que o ambiente não serve (sem réplica de
 * leitura): o card não renderiza esqueleto nem fica em "carregando"; o aviso é
 * único; e a seção não é pedida de novo na mesma sessão.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ fetchPainelService: vi.fn() }));
vi.mock("@/lib/page-mock-mode", () => ({ isPageMockMode: () => false }));
vi.mock("@/lib/preview-mode", () => ({ isPreviewMode: () => false }));
vi.mock("@/features/dashboard-v2/painel-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/dashboard-v2/painel-api")>()),
  fetchPainelService: api.fetchPainelService,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import { PainelServiceWidget } from "@/components/crm/dashboard/painel-service";
import { PainelUnavailableNotice } from "@/components/crm/dashboard/painel-block";
import type { DashboardFiltersState } from "@/features/dashboard-v2/api";
import { usePainelService } from "@/features/dashboard-v2/hooks";
import type { PainelServiceResult } from "@/features/dashboard-v2/painel-api";
import {
  NO_REPLICA_MESSAGE,
  normalizeRequestedBlocks,
  resetServiceAvailabilityForTests,
  unavailableNoticeText,
} from "@/features/dashboard-v2/service-availability";
import {
  countUnavailableSections,
  unavailableServiceWidgets,
} from "@/features/dashboard-v2/visible-sections";

afterEach(() => {
  cleanup();
  resetServiceAvailabilityForTests();
  vi.useRealTimers();
  api.fetchPainelService.mockReset();
});

const OMITTED = { ok: false, error: "omitido" } as const;
const NO_REPLICA = { ok: false, error: NO_REPLICA_MESSAGE, reason: "no_replica" } as const;

function serviceData(patch: Partial<Record<keyof PainelServiceResult, unknown>>) {
  return {
    agora: OMITTED,
    volume: OMITTED,
    tempo: OMITTED,
    heatmap: OMITTED,
    byDepartment: OMITTED,
    connections: OMITTED,
    attendants: OMITTED,
    channels: OMITTED,
    exceptions: OMITTED,
    ...patch,
  } as unknown as PainelServiceResult;
}

function renderWidget(
  id: Parameters<typeof PainelServiceWidget>[0]["id"],
  data: PainelServiceResult,
) {
  return render(
    <PainelServiceWidget
      id={id}
      data={data}
      search=""
      clock="business"
      onRetry={() => {}}
    />,
  );
}

describe("normalizeRequestedBlocks", () => {
  it("seção pedida que voltou omitida, no_replica ou ausente vira indisponível", () => {
    const { blocks, unavailable } = normalizeRequestedBlocks(
      ["tempo", "heatmap", "connections", "exceptions"],
      {
        tempo: OMITTED,
        heatmap: NO_REPLICA,
        exceptions: { ok: true, data: [] },
      },
    );
    expect(unavailable).toEqual(["tempo", "heatmap", "connections"]);
    expect(blocks.tempo).toMatchObject({ ok: false, reason: "no_replica" });
    expect(blocks.connections).toMatchObject({ ok: false, reason: "no_replica" });
    expect(blocks.exceptions).toEqual({ ok: true, data: [] });
  });

  it("erro real do bloco não é tratado como indisponível", () => {
    const { unavailable } = normalizeRequestedBlocks(["tempo"], {
      tempo: { ok: false, error: "Falha ao calcular" },
    });
    expect(unavailable).toEqual([]);
  });
});

describe("cards de seções indisponíveis", () => {
  it("no_replica não renderiza card, esqueleto nem erro", () => {
    for (const [id, patch] of [
      ["tempo", { tempo: NO_REPLICA }],
      ["connections", { connections: NO_REPLICA }],
      ["channels", { channels: NO_REPLICA }],
      ["heatmap", { heatmap: NO_REPLICA, byDepartment: NO_REPLICA }],
      ["summaries", { byDepartment: NO_REPLICA, attendants: NO_REPLICA }],
      ["attendants", { byDepartment: NO_REPLICA, attendants: NO_REPLICA }],
    ] as const) {
      const { container, unmount } = renderWidget(id, serviceData(patch));
      expect(container.innerHTML, id).toBe("");
      unmount();
    }
  });

  it("omitido ainda não pedido segue como esqueleto (carregando)", () => {
    const { container } = renderWidget("tempo", serviceData({}));
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("par com um lado indisponível mostra só o outro", () => {
    const { container } = renderWidget(
      "heatmap",
      serviceData({
        heatmap: NO_REPLICA,
        byDepartment: {
          ok: true,
          data: { series: [], points: [], summaries: [], table: [], empty: true, useBars: false },
        },
      }),
    );
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(container.textContent).not.toContain("Atendimentos iniciados por hora");
    expect(container.textContent).toContain("Atendimentos");
  });
});

describe("aviso único e widgets escondidos", () => {
  const gone = (...keys: string[]) => (section: string) => keys.includes(section);

  it("conta as seções indisponíveis dos widgets visíveis", () => {
    const ids = ["volume", "heatmap", "tempo", "summaries", "connections", "attendants", "channels"];
    const isGone = gone("tempo", "heatmap", "byDepartment", "connections", "attendants", "channels");
    expect(countUnavailableSections(ids, isGone)).toBe(6);
    expect(unavailableServiceWidgets(ids, isGone)).toEqual([
      "heatmap",
      "tempo",
      "summaries",
      "connections",
      "attendants",
      "channels",
    ]);
  });

  it("widget com ao menos uma seção disponível não some", () => {
    expect(unavailableServiceWidgets(["summaries"], gone("byDepartment"))).toEqual([]);
  });

  it("o aviso aparece uma vez, no singular e no plural", () => {
    expect(unavailableNoticeText(1)).toBe(
      "1 gráfico indisponível neste ambiente (sem réplica de leitura)",
    );
    const { container } = render(<PainelUnavailableNotice count={6} />);
    expect(container.querySelectorAll("[data-painel-unavailable]")).toHaveLength(1);
    expect(container.textContent).toContain(
      "6 gráficos indisponíveis neste ambiente (sem réplica de leitura)",
    );
    cleanup();
    expect(render(<PainelUnavailableNotice count={0} />).container.innerHTML).toBe("");
  });
});

const FILTERS: DashboardFiltersState = {
  period: "last_30",
  pipelineId: "p1",
  pipelineIds: ["p1"],
  userIds: [],
  stageIds: [],
  tagIds: [],
  ownerIds: [],
  sources: [],
};

describe("usePainelService com réplica ausente", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchPainelService.mockImplementation(async ({ section }: { section?: string }) => {
      const keys = (section ?? "").split(",");
      return serviceData(
        keys.includes("volume")
          ? { volume: { ok: true, data: { started: { value: 3 }, empty: false, byDay: [] } } }
          : {},
      );
    });
  });

  function mount(filters: DashboardFiltersState) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    return renderHook(
      ({ f }) =>
        usePainelService(f, "business", true, "full", ["volume", "tempo", "heatmap", "channels"]),
      { wrapper, initialProps: { f: filters } },
    );
  }

  const sectionCalls = (section: string) =>
    api.fetchPainelService.mock.calls.filter(([arg]) =>
      String((arg as { section?: string }).section)
        .split(",")
        .includes(section),
    ).length;

  it("marca como indisponível (sem loading infinito) e não repete a chamada ao trocar o período", async () => {
    const view = mount(FILTERS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });

    const data = view.result.current.data;
    expect(data?.tempo).toMatchObject({ ok: false, reason: "no_replica" });
    expect(data?.heatmap).toMatchObject({ ok: false, reason: "no_replica" });
    expect(data?.channels).toMatchObject({ ok: false, reason: "no_replica" });
    expect(sectionCalls("tempo")).toBe(1);
    expect(sectionCalls("heatmap")).toBe(1);

    // Outro período: o volume é pedido de novo; as seções indisponíveis, não.
    view.rerender({ f: { ...FILTERS, period: "last_7" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(sectionCalls("volume")).toBe(2);
    expect(sectionCalls("tempo")).toBe(1);
    expect(sectionCalls("heatmap")).toBe(1);
    expect(view.result.current.data?.tempo).toMatchObject({ ok: false, reason: "no_replica" });
  });

  it("depois do reload (estado do módulo zerado) volta a pedir", async () => {
    const view = mount(FILTERS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(sectionCalls("tempo")).toBe(1);
    view.unmount();

    resetServiceAvailabilityForTests();
    const again = mount(FILTERS);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8_000);
    });
    expect(sectionCalls("tempo")).toBe(2);
    again.unmount();
  });
});
