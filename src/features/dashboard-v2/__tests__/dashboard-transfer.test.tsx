/** @vitest-environment jsdom */
/**
 * Exportar / importar dashboard: download do arquivo, confirmação com quem
 * exportou, recusa de arquivo errado sem chamar o backend, erro do backend
 * em toast, e "Desfazer importação" só quando há backup.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
  confirmAnswer: true,
  lastConfirm: null as null | { title: string; description?: unknown },
  backup: null as unknown,
  importStatus: 200,
  importMessage: "",
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/api", () => ({ apiUrl: (p: string) => p }));
vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({
    dialog: null,
    confirm: async (opts: { title: string; description?: unknown; action?: () => Promise<void> }) => {
      h.lastConfirm = opts;
      if (!h.confirmAnswer) return false;
      try {
        await opts.action?.();
      } catch {
        return false;
      }
      return true;
    },
  }),
}));

import {
  clearDashboardLocalCache,
  dashboardExportFileName,
  parseDashboardFileText,
  useDashboardTransfer,
} from "../dashboard-transfer";

const exported = {
  format: "bwipo.dashboard",
  version: 1,
  exportedAt: "2026-11-05T13:32:00.000Z",
  organizationId: "org-1",
  exportedBy: { id: "u-a", name: "Ana Souza" },
  preset: "comercial",
  data: { visibleWidgets: ["funil"], layout: {}, meta: { v: 2 } },
};

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  if (url === "/api/dashboard/layout/export") return new Response(JSON.stringify(exported));
  if (url === "/api/dashboard/layout/import" && method === "GET") {
    return new Response(JSON.stringify({ backup: h.backup }));
  }
  if (url === "/api/dashboard/layout/import" && method === "POST") {
    return new Response(JSON.stringify(h.importStatus < 400 ? { ok: true } : { message: h.importMessage }), {
      status: h.importStatus,
    });
  }
  if (url === "/api/dashboard/layout/import/undo") return new Response(JSON.stringify({ ok: true }));
  return new Response("{}", { status: 404 });
});

const onApplied = vi.fn();

function Harness() {
  const t = useDashboardTransfer({ onApplied });
  return (
    <div>
      {t.items.map((item) => (
        <button key={item.label} type="button" onClick={item.onClick}>
          {item.label}
        </button>
      ))}
      {t.element}
    </div>
  );
}

function renderHarness() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
}

function pickFile(content: string, name = "dashboard.json") {
  const input = screen.getByTestId("dashboard-import-input") as HTMLInputElement;
  const file = new File([content], name, { type: "application/json" });
  fireEvent.change(input, { target: { files: [file] } });
}

const postCalls = () =>
  fetchMock.mock.calls.filter(
    ([url, init]) => url === "/api/dashboard/layout/import" && init?.method === "POST",
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.confirmAnswer = true;
  h.lastConfirm = null;
  h.backup = null;
  h.importStatus = 200;
  h.importMessage = "";
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("helpers", () => {
  it("nome do arquivo com gestor e data", () => {
    expect(dashboardExportFileName("Ana Souza", new Date(2026, 10, 5))).toBe(
      "dashboard-ana-souza-2026-11-05.json",
    );
    expect(dashboardExportFileName(null, new Date(2026, 0, 2))).toBe("dashboard-gestor-2026-01-02.json");
  });

  it("parse local recusa JSON inválido e arquivo que não é dashboard", () => {
    expect(parseDashboardFileText("{").ok).toBe(false);
    expect(parseDashboardFileText(JSON.stringify({ foo: 1 })).ok).toBe(false);
    expect(parseDashboardFileText(JSON.stringify(exported)).ok).toBe(true);
  });

  it("limpa só os caches do dashboard", () => {
    localStorage.setItem("dashboard-filters:org-1:u-b", "{}");
    localStorage.setItem("dashboard-ui:org-1:u-b", "{}");
    localStorage.setItem("pipeline-view", "kanban");
    clearDashboardLocalCache(localStorage);
    expect(localStorage.getItem("dashboard-filters:org-1:u-b")).toBeNull();
    expect(localStorage.getItem("dashboard-ui:org-1:u-b")).toBeNull();
    expect(localStorage.getItem("pipeline-view")).toBe("kanban");
  });
});

describe("useDashboardTransfer", () => {
  it("exportar baixa o arquivo do backend", async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderHarness();
    fireEvent.click(screen.getByRole("button", { name: "Exportar dashboard" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(h.toast.success).toHaveBeenCalledWith(expect.stringContaining("exportado"));
    click.mockRestore();
  });

  it("importar confirma com quem exportou, envia o arquivo e aplica", async () => {
    renderHarness();
    pickFile(JSON.stringify(exported));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(h.lastConfirm?.title).toBe("Importar dashboard?");
    expect(String(h.lastConfirm?.description)).toContain("Ana Souza");
    expect(JSON.parse(postCalls()[0]![1]!.body as string)).toEqual(exported);
    expect(h.toast.success).toHaveBeenCalledWith("Dashboard importado.");
  });

  it("cancelar a confirmação não envia nada", async () => {
    h.confirmAnswer = false;
    renderHarness();
    pickFile(JSON.stringify(exported));
    await waitFor(() => expect(h.lastConfirm).not.toBeNull());
    expect(postCalls()).toHaveLength(0);
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("arquivo que não é dashboard: toast e nenhuma chamada", async () => {
    renderHarness();
    pickFile("isso não é json");
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(expect.stringContaining("não é um dashboard")));
    expect(postCalls()).toHaveLength(0);
  });

  it("backend recusa (outra empresa): mostra a mensagem dele e não aplica", async () => {
    h.importStatus = 400;
    h.importMessage = "Este dashboard foi exportado de outra empresa e não pode ser importado aqui.";
    renderHarness();
    pickFile(JSON.stringify(exported));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith(h.importMessage));
    expect(onApplied).not.toHaveBeenCalled();
  });

  it("'Desfazer importação' só aparece com backup e chama o undo", async () => {
    renderHarness();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/layout/import", expect.anything()));
    expect(screen.queryByRole("button", { name: "Desfazer importação" })).toBeNull();
    cleanup();

    h.backup = { importedAt: "2026-11-05T14:00:00.000Z", source: { exportedByName: "Ana Souza", exportedAt: "x" } };
    renderHarness();
    fireEvent.click(await screen.findByRole("button", { name: "Desfazer importação" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/layout/import/undo", { method: "POST" });
    expect(String(h.lastConfirm?.description)).toContain("Ana Souza");
  });
});
