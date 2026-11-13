/** @vitest-environment jsdom */
/**
 * Seletor compacto de modelo: o modelo em uso fica à vista; a troca abre um
 * dropdown com busca, agrupado por provedor, com preço e custo por
 * conversa. "Atualizar modelos" e o lápis de preço só para admin.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

import { ModelPicker } from "../model-picker";
import type { CatalogModelOption } from "../model-catalog-ui";

const MODELS: CatalogModelOption[] = [
  { id: "gpt-6.1-terra", name: "GPT-6.1 Terra", provider: "openai", source: "discovered", inputPer1M: null, outputPer1M: null, priceSource: "unknown", estimateInputPer1M: 4, estimateOutputPer1M: 20 },
  { id: "gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai", source: "builtin", inputPer1M: 0.2, outputPer1M: 1.2, priceSource: "builtin", estimateInputPer1M: 0.2, estimateOutputPer1M: 1.2 },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5", provider: "anthropic", source: "builtin", inputPer1M: 2, outputPer1M: 10, priceSource: "builtin", estimateInputPer1M: 2, estimateOutputPer1M: 10 },
];

function mockFetch(canManage: boolean) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({
          models: MODELS,
          lastRefresh: null,
          canManage,
          usage: { days: 30, conversations: 120, avgInputTokens: 5000, avgOutputTokens: 800, models: ["gpt-5.6-luna"] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
  return calls;
}

function renderPicker(onChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ModelPicker value="gpt-5.6-luna" models={MODELS} agentId="ag-1" onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelPicker", () => {
  it("mostra o modelo em uso com preço e custo por conversa, sem abrir a lista", async () => {
    const calls = mockFetch(false);
    renderPicker();
    expect(screen.getByText("GPT-5.6 Luna")).toBeTruthy();
    expect(screen.queryByText("GPT-6.1 Terra")).toBeNull();
    await waitFor(() => expect(screen.getByText(/≈ US\$ 0,0020 por conversa/)).toBeTruthy());
    expect(calls[0]).toContain("agentId=ag-1");
    // Sem admin: nada de atualizar nem editar preço.
    expect(screen.queryByRole("button", { name: /Atualizar modelos/ })).toBeNull();
  });

  it("abre o dropdown, busca e escolhe", async () => {
    mockFetch(true);
    const onChange = renderPicker();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar modelos/ })).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: /Trocar modelo/ }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("group", { name: "OpenAI" })).toBeTruthy();
    expect(within(menu).getByRole("group", { name: "Anthropic (Claude)" })).toBeTruthy();
    expect(within(menu).getByText("Preço desconhecido")).toBeTruthy();
    expect(within(menu).getByText(/até US\$ 0,036 por conversa/)).toBeTruthy();

    fireEvent.change(within(menu).getByRole("textbox", { name: "Buscar modelo" }), { target: { value: "terra" } });
    expect(within(menu).queryByText("Claude Sonnet 5")).toBeNull();
    fireEvent.click(within(menu).getByText("GPT-6.1 Terra"));
    expect(onChange).toHaveBeenCalledWith("gpt-6.1-terra");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });

  it("lápis de preço dentro da lista não troca o modelo", async () => {
    mockFetch(true);
    const onChange = renderPicker();
    await waitFor(() => expect(screen.getByRole("button", { name: /Atualizar modelos/ })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Trocar modelo/ }));
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("button", { name: "Editar preço de GPT-6.1 Terra" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(await screen.findByText("Preço de GPT-6.1 Terra")).toBeTruthy();
  });
});
