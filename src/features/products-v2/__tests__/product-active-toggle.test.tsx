/** @vitest-environment jsdom */
/**
 * Lista de produtos: o selo Ativo/Inativo liga e desliga o produto (antes só
 * dava para desativar, via "Excluir"), e a barra de seleção ativa/desativa
 * em lote. O PUT manda só `isActive` — o resto do cadastro não muda.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/app/(app)/settings/_v2-shell", () => ({ useSettingsHeaderSlots: () => null }));
vi.mock("@/hooks/use-user-role", () => ({ useUserRole: () => ({ role: "ADMIN" }) }));
vi.mock("@/features/data-io/csv-io-dialog", () => ({ CsvIoDialog: () => null }));
vi.mock("../product-dialog", () => ({ ProductDialog: () => null }));
vi.mock("../whatsapp-catalog-dialog", () => ({ WhatsAppCatalogDialog: () => null }));

import { ProductsV2Page } from "../products-page";

const rows = [
  { id: "p1", name: "Educação Física", description: null, sku: "EF", price: "421.10", unit: "un", kind: "COURSE", isActive: false },
  { id: "p2", name: "Administração", description: null, sku: "ADM", price: "173.47", unit: "un", kind: "COURSE", isActive: true },
];

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductsV2Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "PUT") return new Response(JSON.stringify({ product: {} }), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/api/products")) {
      return new Response(JSON.stringify({ products: rows, total: rows.length }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const puts = () =>
  h.fetch.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT")
    .map(([url, init]) => [String(url), JSON.parse(String((init as RequestInit).body))]);

describe("ativar/desativar produto", () => {
  it("produto inativo: clicar no selo ativa", async () => {
    renderPage();
    const sw = await screen.findByRole("switch", { name: "Ativar Educação Física" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(sw);
    await waitFor(() => expect(puts()).toEqual([[expect.stringContaining("/api/products/p1"), { isActive: true }]]));
  });

  it("produto ativo: clicar no selo desativa", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("switch", { name: "Desativar Administração" }));
    await waitFor(() => expect(puts()).toEqual([[expect.stringContaining("/api/products/p2"), { isActive: false }]]));
  });

  it("seleção em lote: Ativar manda isActive para cada selecionado", async () => {
    renderPage();
    await screen.findByText("Educação Física");
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[boxes.length - 2]);
    fireEvent.click(boxes[boxes.length - 1]);
    fireEvent.click(await screen.findByRole("button", { name: /Ativar/ }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts().every(([, b]) => b.isActive === true)).toBe(true);
  });
});
