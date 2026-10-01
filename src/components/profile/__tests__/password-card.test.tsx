/** @vitest-environment jsdom */
/**
 * Card de senha do perfil: trocar a senha (e "sair dos outros
 * dispositivos") renova a sessão deste navegador com a prova devolvida
 * pelo backend e confirma sem ir para o login; sem prova ou com a
 * renovação recusada, cai no caminho antigo.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  update: vi.fn(),
  confirm: vi.fn(),
  signOutToLogin: vi.fn(async () => undefined),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "authenticated", update: h.update }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/lib/sign-out-to-login", () => ({ signOutToLogin: h.signOutToLogin }));
vi.mock("@/hooks/use-confirm", () => ({ useConfirm: () => h.confirm }));

import { PasswordCard } from "@/components/profile/password-card";
import {
  __resetSessionRenewalForTests,
  isSessionRenewalInProgress,
} from "@/lib/session-renewal";

const GRANT = { token: "prova-de-uso-unico", sessionVersion: 4, expiresInSec: 60 };
const RENEWED = { user: { id: "u1", sessionVersion: 4 }, expires: "2099-01-01T00:00:00Z" };

type FetchCall = { url: string; method: string; body: unknown };
let calls: FetchCall[] = [];

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  window.fetch = fetchMock as unknown as typeof window.fetch;
  return fetchMock;
}

function renderCard() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <PasswordCard />
    </QueryClientProvider>,
  );
}

function fillAndSubmit(current = "senha-atual", next = "nova-senha-1") {
  fireEvent.change(screen.getByLabelText(/Senha atual/), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/Confirmar nova senha/), { target: { value: next } });
  fireEvent.click(screen.getByRole("button", { name: /Atualizar senha/ }));
}

beforeEach(() => {
  calls = [];
  vi.clearAllMocks();
  __resetSessionRenewalForTests();
  window.localStorage.clear();
  h.update.mockResolvedValue(RENEWED);
  h.confirm.mockResolvedValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PasswordCard — trocar senha", () => {
  it("renova a sessão com a prova e confirma sem ir para o login", async () => {
    mockFetch(200, { id: "u1", name: "Fulano", sessionRenewal: GRANT });
    renderCard();
    fillAndSubmit();

    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "Senha alterada. As outras sessões foram encerradas.",
      ),
    );
    expect(calls).toEqual([
      {
        url: "/api/profile",
        method: "PUT",
        body: { currentPassword: "senha-atual", newPassword: "nova-senha-1" },
      },
    ]);
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ sessionRenewal: GRANT.token });
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    // Campos limpos.
    expect((screen.getByLabelText(/Senha atual/) as HTMLInputElement).value).toBe("");
  });

  it("a renovação é anunciada antes do PUT (401 revogado na janela não desloga)", async () => {
    const seen: boolean[] = [];
    const fetchMock = vi.fn(async () => {
      seen.push(isSessionRenewalInProgress());
      return new Response(JSON.stringify({ id: "u1", sessionRenewal: GRANT }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    window.fetch = fetchMock as unknown as typeof window.fetch;
    h.update.mockImplementation(async () => {
      seen.push(isSessionRenewalInProgress());
      return RENEWED;
    });
    renderCard();
    fillAndSubmit();
    await waitFor(() => expect(h.toast.success).toHaveBeenCalled());
    expect(seen).toEqual([true, true]);
  });

  it("renovação recusada: avisa e vai para o login", async () => {
    mockFetch(200, { id: "u1", sessionRenewal: GRANT });
    h.update.mockResolvedValue(null);
    renderCard();
    fillAndSubmit();

    await waitFor(() => expect(h.signOutToLogin).toHaveBeenCalledTimes(1), { timeout: 4000 });
    expect(h.toast.success).toHaveBeenCalledWith(
      "Senha alterada. Entre novamente com a nova senha.",
    );
    expect(isSessionRenewalInProgress()).toBe(false);
  });

  it("backend sem prova (versão antiga): mensagem anterior, sem update nem signOut", async () => {
    mockFetch(200, { id: "u1", name: "Fulano" });
    renderCard();
    fillAndSubmit();

    await waitFor(() => expect(h.toast.success).toHaveBeenCalledWith("Senha atualizada"));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.signOutToLogin).not.toHaveBeenCalled();
  });

  it("senha atual incorreta: mostra o erro do backend e não mexe na sessão", async () => {
    mockFetch(400, { message: "Senha atual incorreta." });
    renderCard();
    fillAndSubmit();

    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Senha atual incorreta."));
    expect(h.update).not.toHaveBeenCalled();
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(isSessionRenewalInProgress()).toBe(false);
    // Os campos ficam para a pessoa corrigir.
    expect((screen.getByLabelText(/Senha atual/) as HTMLInputElement).value).toBe("senha-atual");
  });

  it("senhas diferentes ou curta demais: não envia", () => {
    mockFetch(200, {});
    renderCard();
    fireEvent.change(screen.getByLabelText(/Senha atual/), { target: { value: "atual" } });
    fireEvent.change(screen.getByLabelText(/^Nova senha/), { target: { value: "nova-senha-1" } });
    fireEvent.change(screen.getByLabelText(/Confirmar nova senha/), {
      target: { value: "outra-senha-2" },
    });
    expect(
      (screen.getByRole("button", { name: /Atualizar senha/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(calls).toEqual([]);
  });
});

describe("PasswordCard — outros dispositivos", () => {
  it("padrão (manter este): confirma, revoga com keepCurrent e renova a sessão", async () => {
    mockFetch(200, { ok: true, sessionVersion: 4, sessionRenewal: GRANT });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Sair dos outros dispositivos" }));

    await waitFor(() =>
      expect(h.toast.success).toHaveBeenCalledWith(
        "Sessões encerradas nos outros dispositivos. Você continua conectado aqui.",
      ),
    );
    expect(h.confirm).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([
      { url: "/api/me/sessions/revoke-all", method: "POST", body: { keepCurrent: true } },
    ]);
    expect(h.update).toHaveBeenCalledWith({ sessionRenewal: GRANT.token });
    expect(h.signOutToLogin).not.toHaveBeenCalled();
  });

  it("cancelou a confirmação: nada é enviado", async () => {
    mockFetch(200, {});
    h.confirm.mockResolvedValue(false);
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Sair dos outros dispositivos" }));
    await waitFor(() => expect(h.confirm).toHaveBeenCalled());
    expect(calls).toEqual([]);
  });

  it("opção desligada: sai de todos, sem renovar, e vai para o login", async () => {
    mockFetch(200, { ok: true, sessionVersion: 4 });
    renderCard();
    fireEvent.click(screen.getByRole("switch", { name: "Manter este dispositivo conectado" }));
    fireEvent.click(screen.getByRole("button", { name: "Sair de todos os dispositivos" }));

    await waitFor(() => expect(h.signOutToLogin).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([
      { url: "/api/me/sessions/revoke-all", method: "POST", body: { keepCurrent: false } },
    ]);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.toast.success).toHaveBeenCalledWith("Você saiu de todos os dispositivos.");
  });

  it("backend sem prova (derrubou tudo): avisa e vai para o login", async () => {
    mockFetch(200, { ok: true, sessionVersion: 4 });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Sair dos outros dispositivos" }));

    await waitFor(() => expect(h.signOutToLogin).toHaveBeenCalledTimes(1));
    expect(h.toast.success).toHaveBeenCalledWith(
      "Sessões encerradas. Entre novamente para continuar.",
    );
  });

  it("erro do backend: mostra a mensagem e mantém a sessão", async () => {
    mockFetch(500, { message: "Não foi possível encerrar as sessões. Tente novamente." });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Sair dos outros dispositivos" }));

    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        "Não foi possível encerrar as sessões. Tente novamente.",
      ),
    );
    expect(h.signOutToLogin).not.toHaveBeenCalled();
    expect(isSessionRenewalInProgress()).toBe(false);
  });
});
