/** @vitest-environment jsdom */
/**
 * Seção "Regras automáticas por departamento" da Distribuição por Leads:
 * cards com contadores e selo de disponibilidade, interruptor do controle,
 * e o modal com lista + formulário.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  summary: {
    rulesEnabled: true,
    serverNow: "2026-11-04T13:00:00.000Z", // 10:00 em São Paulo
    departments: [
      {
        departmentId: "dia",
        name: "DIA",
        color: "#6366f1",
        icon: "☀️",
        totalMembers: 4,
        activeMembers: 3,
        inactiveMembers: 1,
        eligibleMembers: 3,
        hasEnabledRule: true,
        availableNow: true,
        nextChangeAt: "2026-11-04T21:00:00.000Z",
        nextChangeKind: "deactivates",
        rules: [
          {
            id: "r1",
            departmentId: "dia",
            departmentName: "DIA",
            startMinute: 540,
            endMinute: 1080,
            weekdays: [1, 2, 3, 4, 5],
            enabled: true,
            createdAt: "",
            updatedAt: "",
          },
        ],
      },
      {
        departmentId: "noite",
        name: "NOITE",
        color: "#0ea5e9",
        icon: "🌙",
        totalMembers: 2,
        activeMembers: 2,
        inactiveMembers: 0,
        eligibleMembers: 0,
        hasEnabledRule: true,
        availableNow: false,
        nextChangeAt: "2026-11-04T18:00:00.000Z",
        nextChangeKind: "activates",
        rules: [
          {
            id: "r2",
            departmentId: "noite",
            departmentName: "NOITE",
            startMinute: 900,
            endMinute: 1320,
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            enabled: true,
            createdAt: "",
            updatedAt: "",
          },
        ],
      },
      {
        departmentId: "tres",
        name: "Departamento 3",
        color: "#999",
        icon: "🏢",
        totalMembers: 1,
        activeMembers: 1,
        inactiveMembers: 0,
        eligibleMembers: 0,
        hasEnabledRule: false,
        availableNow: false,
        nextChangeAt: null,
        nextChangeKind: null,
        rules: [],
      },
    ],
  },
  settings: { enabled: true, departmentRulesEnabled: true },
  fetch: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/page-mock-mode", () => ({ isPageMockMode: () => false }));
vi.mock("@/lib/api", () => ({ apiUrl: (p: string) => p }));

import { LeadsDepartmentRulesSection } from "../leads-department-rules-section";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(body),
  };
}

function renderSection(canManage = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <LeadsDepartmentRulesSection canManage={canManage} />
    </QueryClientProvider>,
  );
}

// `<dialog>` nativo: jsdom não implementa showModal; sem `open` os botões do
// modal ficam inacessíveis para getByRole.
const showModal = HTMLDialogElement.prototype.showModal;
const closeDialog = HTMLDialogElement.prototype.close;

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    fn(0);
    return 0;
  });
  h.fetch.mockReset();
  h.toast.success.mockReset();
  h.toast.error.mockReset();
  h.fetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (url.endsWith("/department-rules/summary")) return jsonResponse(h.summary);
    if (url.endsWith("/leads/settings") && !init?.method) return jsonResponse(h.settings);
    if (url.endsWith("/leads/settings") && init?.method === "PUT") {
      return jsonResponse({ ...h.settings, ...JSON.parse(init.body ?? "{}") });
    }
    if (url.endsWith("/department-rules") && init?.method === "POST") {
      return jsonResponse({ rule: { id: "r3", ...JSON.parse(init.body ?? "{}") } }, 201);
    }
    return jsonResponse({ message: `sem mock para ${init?.method ?? "GET"} ${url}` }, 500);
  });
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = closeDialog;
});

describe("LeadsDepartmentRulesSection", () => {
  it("mostra um card por departamento com contadores, selo e próxima mudança", async () => {
    renderSection();
    expect(await screen.findByText("DIA")).toBeTruthy();
    expect(screen.getByText("NOITE")).toBeTruthy();
    expect(screen.getByText("Departamento 3")).toBeTruthy();
    expect(screen.getByText("Disponível")).toBeTruthy();
    expect(screen.getByText("Fora do horário")).toBeTruthy();
    expect(screen.getByText("Sem regra")).toBeTruthy();
    expect(screen.getByText("Não participa da distribuição")).toBeTruthy();
    // 18:00 e 15:00 de hoje em São Paulo.
    expect(screen.getByText(/Encerra hoje 18:00/)).toBeTruthy();
    expect(screen.getByText(/Ativa hoje 15:00/)).toBeTruthy();
  });

  it("o interruptor grava departmentRulesEnabled na settings", async () => {
    renderSection();
    const sw = await screen.findByRole("switch", { name: "Regras automáticas por departamento" });
    await waitFor(() => expect(sw.getAttribute("aria-checked")).toBe("true"));
    fireEvent.click(sw);
    await waitFor(() => {
      const put = h.fetch.mock.calls.find(
        ([url, init]) => String(url).endsWith("/leads/settings") && init?.method === "PUT",
      );
      expect(put).toBeTruthy();
      expect(JSON.parse(put![1].body)).toEqual({ departmentRulesEnabled: false });
    });
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Regras por departamento desligadas."));
  });

  it("o modal lista as regras e cria uma nova com os dias e horários do formulário", async () => {
    renderSection();
    await screen.findByText("DIA"); // o botão fica desabilitado até o resumo chegar
    fireEvent.click(screen.getByRole("button", { name: /Regras automáticas/ }));
    // O texto da regra aparece no card e na lista do modal.
    await waitFor(() => expect(screen.getAllByText("09:00 às 18:00 · Seg a Sex")).toHaveLength(2));
    expect(screen.getAllByText("15:00 às 22:00 · Todos os dias")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Nova regra/ }));
    // Padrão: Seg a Sex 09:00–18:00. Tira segunda e marca sábado.
    fireEvent.click(screen.getByRole("button", { name: "segunda" }));
    fireEvent.click(screen.getByRole("button", { name: "sábado" }));
    const inputs = screen.getAllByDisplayValue(/^\d{2}:\d{2}$/);
    fireEvent.change(inputs[0]!, { target: { value: "22:00" } });
    fireEvent.change(inputs[1]!, { target: { value: "02:00" } });
    expect(screen.getByText(/termina no dia seguinte/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Criar regra/ }));

    await waitFor(() => {
      const post = h.fetch.mock.calls.find(
        ([url, init]) => String(url).endsWith("/department-rules") && init?.method === "POST",
      );
      expect(post).toBeTruthy();
      expect(JSON.parse(post![1].body)).toEqual({
        departmentId: "dia",
        startMinute: 1320,
        endMinute: 120,
        weekdays: [2, 3, 4, 5, 6],
        enabled: true,
      });
    });
    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Regra criada."));
  });

  it("sem permissão: vê os cards e as regras, sem interruptor nem botões de edição", async () => {
    renderSection(false);
    expect(await screen.findByText("DIA")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Regras automáticas por departamento" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Regras automáticas/ }));
    await waitFor(() => expect(screen.getAllByText("09:00 às 18:00 · Seg a Sex")).toHaveLength(2));
    expect(screen.queryByRole("button", { name: /Nova regra/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir regra" })).toBeNull();
  });
});
