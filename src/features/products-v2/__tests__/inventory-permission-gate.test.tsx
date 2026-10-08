/** @vitest-environment jsdom */
/**
 * Selo de disponibilidade / inventário só consultam o estoque com permissão.
 *
 * Medido em produção (08/10/2026): `GET /api/products/:id/inventory` exige
 * `inventory:view` e respondia 403 em 100% das chamadas de MEMBER sem a
 * permissão — ~130 negadas por hora, até 38 produtos por usuário, repetidas
 * a cada remontagem do selo (`staleTime` 30 s). O selo sumia em silêncio.
 *
 * O que fica travado aqui:
 *  - MEMBER sem `inventory:view` abre uma tela com produtos → nenhuma
 *    chamada a `/inventory`, mesmo remontando;
 *  - com a permissão → uma chamada por produto e o selo como antes;
 *  - `useProductInventory` segue a mesma regra.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const perms = vi.hoisted(() => ({ granted: new Set<string>() }));
vi.mock("@/hooks/use-my-permissions", () => ({
  useCan: (key: string) => perms.granted.has(key),
}));

import { AvailabilityBadge } from "@/features/products-v2/availability-badge";
import { useProductInventory } from "@/features/products-v2/hooks";

const PRODUCTS = ["prod-1", "prod-2", "prod-3"];

function inventoryResponse(productId: string) {
  const balance = productId === "prod-3" ? 0 : 3;
  return {
    pools: [
      {
        id: `pool-${productId}`,
        orgUnit: null,
        consumeTrigger: "manual",
        allowNegative: false,
        stats: { balance, available: balance, reserved: 0, consumed: 0 },
      },
    ],
    movements: [],
  };
}

const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const productId = /\/api\/products\/([^/]+)\/inventory/.exec(url)?.[1] ?? "";
  return new Response(JSON.stringify(inventoryResponse(productId)), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function wrap(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

/** Tela com produtos: cada item renderiza o selo, como no painel do negócio. */
function ProductList() {
  return (
    <ul>
      {PRODUCTS.map((id) => (
        <li key={id} data-testid={`item-${id}`}>
          {id} <AvailabilityBadge productId={id} />
        </li>
      ))}
    </ul>
  );
}

async function settle() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function inventoryCalls() {
  return fetchMock.mock.calls.filter(([input]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    return url.includes("/inventory");
  });
}

beforeEach(() => {
  perms.granted.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvailabilityBadge — MEMBER sem inventory:view", () => {
  it("não chama /inventory para nenhum produto nem ao remontar", async () => {
    const qc = client();
    const Wrapper = wrap(qc);

    const first = render(<ProductList />, { wrapper: Wrapper });
    await settle();
    expect(inventoryCalls()).toHaveLength(0);
    expect(screen.queryByText(/disp\.|Sem saldo/)).toBeNull();

    // Remontagem (ex.: reabrir o negócio) — antes era uma nova rajada de 403.
    first.unmount();
    render(<ProductList />, { wrapper: Wrapper });
    await settle();
    expect(inventoryCalls()).toHaveLength(0);
    expect(screen.getByTestId("item-prod-1")).toBeTruthy();
  });
});

describe("AvailabilityBadge — com inventory:view", () => {
  it("chama /inventory uma vez por produto e renderiza o selo", async () => {
    perms.granted.add("inventory:view");
    const qc = client();

    render(<ProductList />, { wrapper: wrap(qc) });

    await waitFor(() => expect(screen.getAllByText("3 disp.")).toHaveLength(2));
    expect(screen.getByText("Sem saldo")).toBeTruthy();

    const urls = inventoryCalls().map(([input]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(urls).toHaveLength(PRODUCTS.length);
    for (const id of PRODUCTS) {
      expect(urls).toContain(`/api/products/${id}/inventory`);
    }
  });
});

describe("useProductInventory", () => {
  it("fica desligado sem inventory:view", async () => {
    const { result } = renderHook(() => useProductInventory("prod-1"), {
      wrapper: wrap(client()),
    });
    await settle();
    expect(inventoryCalls()).toHaveLength(0);
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("busca com inventory:view", async () => {
    perms.granted.add("inventory:view");
    const { result } = renderHook(() => useProductInventory("prod-1"), {
      wrapper: wrap(client()),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(inventoryCalls()).toHaveLength(1);
    expect(result.current.data?.pools).toHaveLength(1);
  });
});
