import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
}));

import {
  buildDashboardPatchBody,
  createRemoteSliceSaver,
  loadRemoteDashboard,
  patchRemoteDashboardMeta,
  readJson,
  resetDashboardRemoteForTests,
  resolveDashboardSlice,
  saveDashboardSlice,
  writeJson,
} from "@/features/dashboard-v2/dashboard-persist";

function installStorage(fetchImpl?: typeof fetch) {
  const mem = new Map<string, string>();
  const storage = {
    getItem: (key: string) => mem.get(key) ?? null,
    setItem: (key: string, value: string) => {
      mem.set(key, value);
    },
    removeItem: (key: string) => {
      mem.delete(key);
    },
  };
  vi.stubGlobal("window", {
    localStorage: storage,
    fetch: fetchImpl ?? globalThis.fetch,
  });
  if (fetchImpl) vi.stubGlobal("fetch", fetchImpl);
}

function fetchInit(mock: { mock: { calls: unknown[][] } }, index: number): RequestInit {
  const call = mock.mock.calls[index];
  const init = call?.[1];
  if (!init || typeof init !== "object") throw new Error("fetch sem init");
  return init as RequestInit;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("persistência do dashboard", () => {
  afterEach(() => {
    resetDashboardRemoteForTests();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("backend vence localStorage antigo", () => {
    const picked = resolveDashboardSlice(
      { ok: true, meta: { v: 2, negocios: { version: 2, cards: ["remoto"] } } },
      "negocios",
      { version: 2, cards: ["local"] },
    );
    expect(picked.source).toBe("remote");
    expect(picked.migrate).toBe(false);
    expect(picked.value).toEqual({ version: 2, cards: ["remoto"] });
  });

  it("localStorage migra quando o backend está vazio", async () => {
    installStorage();
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ layout: null })));
    const remote = await loadRemoteDashboard();
    const local = { tab: "service", clock: "elapsed" as const };
    const picked = resolveDashboardSlice(remote, "ui", local);
    expect(picked.migrate).toBe(true);
    expect(picked.value).toEqual(local);
    const ok = await saveDashboardSlice({
      storageKey: "dashboard-ui:org:u1",
      metaKey: "ui",
      value: local,
    });
    expect(ok).toBe(true);
    const body = JSON.parse(
      (vi.mocked(fetch).mock.calls[1]?.[1] as RequestInit).body as string,
    ) as { meta: Record<string, unknown> };
    expect(body.meta.ui).toEqual(local);
    expect(body.meta.v).toBe(2);
    expect(readJson("dashboard-ui:org:u1")).toEqual(local);
  });

  it("novo navegador sem localStorage recupera o backend", async () => {
    installStorage();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          data: {
            meta: {
              v: 2,
              negocios: { version: 2, cards: ["remoto"] },
              service: { order: ["agora"], hidden: [] },
              ui: { tab: "service" },
              filters: { period: "last_7", pipelineIds: ["p1"] },
            },
          },
        }),
      ),
    );
    const remote = await loadRemoteDashboard();
    expect(readJson("dashboard-negocios-grid:org:u1")).toBeNull();
    const negocios = resolveDashboardSlice(remote, "negocios", null);
    const service = resolveDashboardSlice(remote, "service", null);
    const ui = resolveDashboardSlice(remote, "ui", null);
    const filters = resolveDashboardSlice(remote, "filters", null);
    expect(negocios).toMatchObject({
      source: "remote",
      migrate: false,
      value: { version: 2, cards: ["remoto"] },
    });
    expect(service.value).toEqual({ order: ["agora"], hidden: [] });
    expect(ui.value).toEqual({ tab: "service" });
    expect(filters.value).toEqual({ period: "last_7", pipelineIds: ["p1"] });
  });

  it("body de service não leva negocios e body de ui não leva os outros", () => {
    const service = buildDashboardPatchBody({
      service: { order: ["volume"], hidden: ["agora"] },
    });
    expect(service).toEqual({
      meta: { v: 2, service: { order: ["volume"], hidden: ["agora"] } },
    });
    expect(service).not.toHaveProperty("organizationId");
    expect(service).not.toHaveProperty("userId");

    const ui = buildDashboardPatchBody({ ui: { tab: "deals", clock: "business" } });
    expect(ui.meta).toEqual({ v: 2, ui: { tab: "deals", clock: "business" } });
    expect(ui.meta).not.toHaveProperty("negocios");
    expect(ui.meta).not.toHaveProperty("service");
  });

  it("4xx e 5xx não são sucesso e o local permanece", async () => {
    installStorage();
    writeJson("k", { cards: ["local"] });
    const fetchMock = vi.fn(async () => jsonResponse({ message: "no" }, 500));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await saveDashboardSlice({
        storageKey: "k",
        metaKey: "negocios",
        value: { cards: ["local"] },
      }),
    ).toBe(false);
    expect(readJson("k")).toEqual({ cards: ["local"] });

    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "bad" }, 400));
    expect(await patchRemoteDashboardMeta({ ui: { tab: "service" } })).toBe(false);
    const body = JSON.parse(String(fetchInit(fetchMock, 1).body));
    expect(body.organizationId).toBeUndefined();
    expect(body.userId).toBeUndefined();
    expect(readJson("k")).toEqual({ cards: ["local"] });
  });

  it("flush no unmount envia a alteração pendente do debounce", async () => {
    installStorage();
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const saver = createRemoteSliceSaver("operator", 800);
    saver.schedule({ storageKey: "fila", value: { order: ["kpis"], hidden: ["tasks"] } });
    expect(fetchMock).not.toHaveBeenCalled();
    saver.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = fetchInit(fetchMock, 0);
    expect(init.keepalive).toBe(true);
    expect(JSON.parse(init.body as string).meta).toEqual({
      v: 2,
      operator: { order: ["kpis"], hidden: ["tasks"] },
    });
    expect(readJson("fila")).toEqual({ order: ["kpis"], hidden: ["tasks"] });
  });
});
