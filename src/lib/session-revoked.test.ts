/** @vitest-environment jsdom */
/**
 * 401 `code: "SESSION_REVOKED"` (troca de senha / sair de todos os
 * dispositivos): o cliente de API faz signOut + login UMA vez, sem loop.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOutToLogin = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/lib/sign-out-to-login", () => ({ signOutToLogin }));

import { ApiError, parseApiResponse } from "@/lib/api";
import {
  __resetSessionRenewalForTests,
  beginSessionRenewal,
  endSessionRenewal,
  SESSION_RENEWAL_GRACE_MS,
} from "@/lib/session-renewal";
import {
  __resetSessionRevokedForTests,
  handleSessionRevoked,
  isSessionRevoked,
  SESSION_REVOKED_GUARD_MS,
} from "@/lib/session-revoked";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const REVOKED = { message: "Sessão expirada. Entre novamente.", code: "SESSION_REVOKED" };

async function flush() {
  // import() dinâmico do sign-out + microtasks.
  for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
}

describe("sessão revogada", () => {
  beforeEach(() => {
    __resetSessionRevokedForTests();
    __resetSessionRenewalForTests();
    window.sessionStorage.clear();
    window.localStorage.clear();
    signOutToLogin.mockClear();
    window.history.replaceState(null, "", "/inbox");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("isSessionRevoked: só 401 com o código", () => {
    expect(isSessionRevoked(401, "SESSION_REVOKED")).toBe(true);
    expect(isSessionRevoked(401, "AUTH_REQUIRED")).toBe(false);
    expect(isSessionRevoked(401, undefined)).toBe(false);
    expect(isSessionRevoked(403, "SESSION_REVOKED")).toBe(false);
  });

  it("parseApiResponse: 401 SESSION_REVOKED lança ApiError e dispara o signOut uma vez", async () => {
    await expect(parseApiResponse(json(401, REVOKED), "falhou")).rejects.toMatchObject({
      status: 401,
      code: "SESSION_REVOKED",
      message: "Sessão expirada. Entre novamente.",
    });
    // Rajada de requests da mesma tela, todos 401.
    for (let i = 0; i < 5; i += 1) {
      await expect(parseApiResponse(json(401, REVOKED), "falhou")).rejects.toBeInstanceOf(
        ApiError,
      );
    }
    await flush();
    expect(signOutToLogin).toHaveBeenCalledTimes(1);
  });

  it("401 comum (sessão expirada, sem código) NÃO desloga sozinho — comportamento anterior", async () => {
    await expect(
      parseApiResponse(json(401, { message: "Não autorizado." }), "falhou"),
    ).rejects.toMatchObject({ status: 401, code: "AUTH_REQUIRED" });
    await flush();
    expect(signOutToLogin).not.toHaveBeenCalled();
  });

  it("sem loop entre recargas: nova página dentro de 60s não desloga de novo", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-09-30T12:00:00Z"));
    const signOut = vi.fn(async () => undefined);
    expect(handleSessionRevoked(signOut)).toBe(true);

    __resetSessionRevokedForTests(); // "recarregou a página"
    vi.setSystemTime(Date.now() + SESSION_REVOKED_GUARD_MS - 1);
    expect(handleSessionRevoked(signOut)).toBe(false);

    vi.setSystemTime(Date.now() + 2);
    expect(handleSessionRevoked(signOut)).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(2);
  });

  it("nas páginas de autenticação não faz nada", () => {
    const signOut = vi.fn(async () => undefined);
    for (const path of ["/login", "/login/", "/reset-password", "/accept-invite/abc"]) {
      window.history.replaceState(null, "", path);
      expect(handleSessionRevoked(signOut)).toBe(false);
    }
    expect(signOut).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/loginho"); // não é página de auth
    expect(handleSessionRevoked(signOut)).toBe(true);
  });

  it("renovação em andamento (troca de senha nesta aba): 401 revogado NÃO desloga", async () => {
    beginSessionRenewal();
    // Polling/presença da própria tela na janela entre o incremento e o cookie novo.
    for (let i = 0; i < 3; i += 1) {
      await expect(parseApiResponse(json(401, REVOKED), "falhou")).rejects.toMatchObject({
        status: 401,
        code: "SESSION_REVOKED",
      });
    }
    await flush();
    expect(signOutToLogin).not.toHaveBeenCalled();
  });

  it("renovação anunciada por OUTRA aba (localStorage): esta aba também não desloga", () => {
    const signOut = vi.fn(async () => undefined);
    window.localStorage.setItem("crm:session-renewal-until", String(Date.now() + 10_000));
    expect(handleSessionRevoked(signOut)).toBe(false);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("renovação que falhou: o próximo 401 revogado desloga normalmente", () => {
    const signOut = vi.fn(async () => undefined);
    beginSessionRenewal();
    expect(handleSessionRevoked(signOut)).toBe(false);
    endSessionRenewal(false);
    expect(handleSessionRevoked(signOut)).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it("renovação concluída: resposta atrasada com o cookie antigo não desloga; revogação posterior, sim", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-01T12:00:00Z"));
    const signOut = vi.fn(async () => undefined);
    beginSessionRenewal();
    endSessionRenewal(true);
    expect(handleSessionRevoked(signOut)).toBe(false);
    // Passada a folga, um 401 revogado é uma revogação de verdade.
    vi.setSystemTime(Date.now() + SESSION_RENEWAL_GRACE_MS + 1);
    expect(handleSessionRevoked(signOut)).toBe(true);
  });

  it("signOut que falha não é repetido", async () => {
    const signOut = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(handleSessionRevoked(signOut)).toBe(true);
    await flush();
    expect(handleSessionRevoked(signOut)).toBe(false);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
