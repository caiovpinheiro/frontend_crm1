/** @vitest-environment jsdom */
/**
 * "Encerrar sessões" na edição de usuário: só admin vê, e não para o
 * próprio usuário; confirma antes de chamar
 * `POST /api/users/:id/sessions/revoke`, com toast de sucesso/erro.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: { user: { id: "admin-1", role: "ADMIN" } } as { user: { id: string; role: string } },
  confirm: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: h.session, status: "authenticated" }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => h.confirm }));

import { RevokeUserSessionsButton } from "../revoke-user-sessions-button";

type FetchCall = { url: string; method: string };
let calls: FetchCall[] = [];

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), method: init?.method ?? "GET" });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderButton(userId = "u-2") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <RevokeUserSessionsButton userId={userId} userName="Maria" />
    </QueryClientProvider>,
  );
}

const button = () => screen.queryByRole("button", { name: /Encerrar sessões/ });

beforeEach(() => {
  calls = [];
  vi.clearAllMocks();
  h.session = { user: { id: "admin-1", role: "ADMIN" } };
  h.confirm.mockResolvedValue(true);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("RevokeUserSessionsButton", () => {
  it("admin vê o botão e, depois de confirmar, chama a rota de revogação", async () => {
    mockFetch(200, { ok: true, sessionVersion: 7 });
    renderButton();
    fireEvent.click(button()!);

    await waitFor(() => expect(h.toast.success).toHaveBeenCalledTimes(1));
    expect(h.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "O usuário será desconectado de todos os dispositivos.",
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toMatch(/\/api\/users\/u-2\/sessions\/revoke$/);
  });

  it("sem confirmar, não chama a rota", async () => {
    mockFetch(200, { ok: true, sessionVersion: 7 });
    h.confirm.mockResolvedValue(false);
    renderButton();
    fireEvent.click(button()!);
    await waitFor(() => expect(h.confirm).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(0);
  });

  it("erro da API vira toast de erro com a mensagem do backend", async () => {
    mockFetch(403, { message: "Sem permissão." });
    renderButton();
    fireEvent.click(button()!);
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Sem permissão."));
    expect(h.toast.success).not.toHaveBeenCalled();
  });

  it("fica desabilitado enquanto envia", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve))),
    );
    renderButton();
    fireEvent.click(button()!);
    await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(true));
    release(new Response("{}", { status: 200 }));
    await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false));
  });

  it("não-admin não vê o botão", () => {
    h.session = { user: { id: "m-1", role: "MANAGER" } };
    renderButton();
    expect(button()).toBeNull();
  });

  it("admin editando a si mesmo não vê o botão", () => {
    renderButton("admin-1");
    expect(button()).toBeNull();
  });
});
