/** @vitest-environment jsdom */
/**
 * Configurações → Equipe: a coluna Telefonia fazia um
 * `GET /api/users/:id/telephony` por linha (25 linhas = 25 requisições).
 * Com o backend novo o status vem em cada usuário de `GET /api/users`
 * (campo `telephony`): abrir a lista com 25 usuários faz só
 *   1. `GET /api/users` (a lista, já com a telefonia), e
 *   2. `GET /api/roles` (opções do seletor "Função" de cada linha).
 * `telephony: null` = sem telefonia, sem busca. Sem o campo na lista
 * inteira (backend antigo), cada linha busca como antes.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: { user: { id: "admin-1", role: "ADMIN" } },
    status: "authenticated",
  }),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/team",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
  useIsDesktop: () => true,
  useIsMobile: () => false,
  useIsTablet: () => false,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import TeamV2ClientPage from "../client-page";

type Telephony = {
  telephonyEnabled: boolean;
  provisioningStep: string;
  provisioningError: string | null;
  provisionedAt: string | null;
} | null;

let calls: string[] = [];

function users(n: number, telephony: (i: number) => Telephony | "absent") {
  return Array.from({ length: n }, (_, i) => {
    const base = {
      id: `u-${i}`,
      name: `Pessoa ${String(i).padStart(2, "0")}`,
      email: `p${i}@exemplo.test`,
      role: i === 0 ? "ADMIN" : "MEMBER",
    };
    const t = telephony(i);
    return t === "absent" ? base : { ...base, telephony: t };
  });
}

function mockApi(list: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), "http://localhost");
      calls.push(url.pathname);
      let body: unknown = {};
      if (url.pathname === "/api/users") body = list;
      else if (url.pathname === "/api/roles") body = [];
      else if (/^\/api\/users\/[^/]+\/telephony$/.test(url.pathname)) {
        body = {
          telephonyEnabled: false,
          provisioningStep: "IDLE",
          provisioningError: null,
          provisionedAt: null,
        };
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TeamV2ClientPage />
    </QueryClientProvider>,
  );
}

const ACTIVE = {
  telephonyEnabled: true,
  provisioningStep: "ACTIVE",
  provisioningError: null,
  provisionedAt: "2026-10-01T00:00:00.000Z",
};

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  calls = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  window.localStorage.clear();
  window.localStorage.setItem("crm:list-view", "tabela");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Equipe: telefonia sem N+1", () => {
  it("25 usuários com `telephony` na lista: no máximo 2 requisições (lista + funções)", async () => {
    mockApi(users(25, (i) => (i % 3 === 0 ? ACTIVE : null)));
    renderPage();
    await waitFor(() => expect(screen.getAllByRole("switch", { name: "Telefonia" })).toHaveLength(25));
    // Dá tempo a qualquer busca atrasada aparecer.
    await new Promise((r) => setTimeout(r, 50));

    process.stdout.write(`[equipe] requisições: ${calls.join(", ")}\n`);
    expect(calls.filter((p) => p.endsWith("/telephony"))).toHaveLength(0);
    expect(new Set(calls)).toEqual(new Set(["/api/users", "/api/roles"]));
    expect(calls.length).toBeLessThanOrEqual(2);

    const switches = screen.getAllByRole("switch", { name: "Telefonia" });
    const checked = switches.filter((s) => s.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(9); // i = 0, 3, …, 24 ativos; null = sem telefonia
  });

  it("backend antigo (nenhum usuário com `telephony`): cada linha busca como antes", async () => {
    mockApi(users(25, () => "absent"));
    renderPage();
    await waitFor(() =>
      expect(calls.filter((p) => p.endsWith("/telephony"))).toHaveLength(25),
    );
    await waitFor(() => expect(screen.getAllByRole("switch", { name: "Telefonia" })).toHaveLength(25));
  });
});
