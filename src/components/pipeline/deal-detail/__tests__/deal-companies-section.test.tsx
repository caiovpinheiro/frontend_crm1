/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ insert: vi.fn(), fetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/composer-insert", () => ({ insertComposerText: h.insert }));
vi.mock("@/lib/api", () => ({ apiUrl: (p: string) => p }));
vi.mock("@/components/companies/edit-company-dialog", () => ({ EditCompanyDialog: () => null }));
vi.mock("@/features/directory-v2/hooks", () => ({
  useCompany: () => ({ data: undefined }),
  useCompanies: () => ({
    isLoading: false,
    data: { items: [{ id: "c2", name: "iad Imobiliária", city: "Campinas", state: "SP", size: null }] },
  }),
}));

import { DealCompaniesSection, companyMessage } from "../deal-companies-section";

const primary = {
  companyId: "c1",
  isPrimary: true,
  linkedAt: "2026-11-16T12:00:00Z",
  company: {
    id: "c1", number: 4, name: "Cacau Lopes", cnpj: "12.345.678/0001-90", phone: "+551130000000",
    email: "rh@cacaulopes.com.br", cep: "01000-000", city: "São Paulo", state: "SP", address: "Rua A, 100",
  },
};
const second = { ...primary, companyId: "c3", isPrimary: false, company: { ...primary.company, id: "c3", name: "Lumi" } };

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DealCompaniesSection dealId="d1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockImplementation(async (url: string, init?: RequestInit) => {
    const items = init?.method === "POST" ? [primary, second] : [primary, second];
    return new Response(JSON.stringify({ items }), { status: init?.method === "POST" ? 201 : 200 });
  });
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Bloco Empresas do negócio", () => {
  it("mostra as empresas com a principal marcada e os dados", async () => {
    renderSection();
    expect(await screen.findByText("Cacau Lopes")).toBeTruthy();
    expect(screen.getByText("Principal")).toBeTruthy();
    expect(screen.getAllByText("CNPJ: 12.345.678/0001-90").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tornar principal")).toHaveLength(1);
  });

  it("Enviar dados coloca a mensagem da empresa no chat", async () => {
    renderSection();
    fireEvent.click((await screen.findAllByText("Enviar dados"))[0]!);
    expect(h.insert).toHaveBeenCalledWith(companyMessage(primary.company));
  });

  it("Adicionar busca e vincula; Tornar principal manda PATCH", async () => {
    renderSection();
    await screen.findByText("Cacau Lopes");
    fireEvent.click(screen.getByLabelText("Adicionar empresa"));
    fireEvent.click(screen.getByText("iad Imobiliária"));
    await waitFor(() =>
      expect(h.fetch).toHaveBeenCalledWith(
        "/api/deals/d1/companies",
        expect.objectContaining({ method: "POST", body: JSON.stringify({ companyId: "c2" }) }),
      ),
    );
    fireEvent.click(screen.getByText("Tornar principal"));
    await waitFor(() =>
      expect(h.fetch).toHaveBeenCalledWith(
        "/api/deals/d1/companies/c3",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });
});

describe("companyMessage", () => {
  it("monta nome, endereço, telefone, e-mail e CNPJ", () => {
    expect(companyMessage(primary.company)).toBe(
      [
        "🏢 *Cacau Lopes*",
        "📍 Rua A, 100 — São Paulo/SP, CEP 01000-000",
        "📞 +551130000000",
        "✉️ rh@cacaulopes.com.br",
        "CNPJ: 12.345.678/0001-90",
      ].join("\n"),
    );
    expect(companyMessage({ ...primary.company, address: null, city: null, state: null, cep: null, phone: null, email: null, cnpj: null })).toBe(
      "🏢 *Cacau Lopes*",
    );
  });
});
