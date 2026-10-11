/** @vitest-environment jsdom */
/**
 * `TelephonyToggle` com o status vindo da lista (`GET /api/users`, campo
 * `telephony`): não busca `GET /api/users/:id/telephony`; depois de
 * ligar/desligar recarrega a LISTA (é dela que o status vem).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TelephonyToggle, userListCarriesTelephony } from "./telephony-toggle";

let calls: Array<{ path: string; method: string }> = [];

beforeEach(() => {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      calls.push({ path: url.pathname, method: init?.method ?? "GET" });
      return new Response(
        JSON.stringify({
          telephonyEnabled: false,
          provisioningStep: "IDLE",
          provisioningError: null,
          provisionedAt: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderToggle(props: Parameters<typeof TelephonyToggle>[0]) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  render(
    <QueryClientProvider client={qc}>
      <TelephonyToggle {...props} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe("TelephonyToggle", () => {
  it("telephony: null → sem telefonia, sem buscar; ligar recarrega a lista de usuários", async () => {
    const { invalidate } = renderToggle({ userId: "u-1", telephony: null });
    const sw = screen.getByRole("switch", { name: "Telefonia" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toHaveLength(0);

    fireEvent.click(sw);
    await waitFor(() => expect(calls).toEqual([{ path: "/api/users/u-1/telephony", method: "PATCH" }]));
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ["users"] }),
    );
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: ["telephony-status", "u-1"] });
  });

  it("sem o prop (backend antigo): busca o status da linha", async () => {
    renderToggle({ userId: "u-2" });
    await waitFor(() => expect(calls).toEqual([{ path: "/api/users/u-2/telephony", method: "GET" }]));
  });

  it("userListCarriesTelephony: só a chave ausente em TODOS indica backend antigo", () => {
    expect(userListCarriesTelephony([{ id: "a" }, { id: "b" }])).toBe(false);
    expect(userListCarriesTelephony([{ id: "a" }, { id: "b", telephony: null }])).toBe(true);
    expect(userListCarriesTelephony([])).toBe(false);
  });
});
