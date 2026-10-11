/** @vitest-environment jsdom */
/**
 * 401 `code: "SESSION_REVOKED"` (troca de senha / sair de todos os
 * dispositivos): o cliente de API faz signOut + login UMA vez, sem loop.
 * E QUALQUER 401 dos laços em segundo plano (ping/activity/SSE), uma vez
 * por navegador (marca em `localStorage`, as outras abas vão ao login).
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
  CROSS_TAB_LOGIN_DELAY_MS,
  handleSessionRevoked,
  handleUnauthorized,
  isSessionEnded,
  isSessionRevoked,
  SESSION_REVOKED_GUARD_MS,
  SESSION_REVOKED_STORAGE_KEY,
  watchSessionEndInOtherTabs,
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
    for (const path of [
      "/login",
      "/login/",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/accept-invite/abc",
      "/onboarding",
    ]) {
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

describe("401 dos laços em segundo plano (ping/activity/SSE)", () => {
  beforeEach(() => {
    __resetSessionRevokedForTests();
    __resetSessionRenewalForTests();
    window.sessionStorage.clear();
    window.localStorage.clear();
    window.history.replaceState(null, "", "/inbox");
  });
  afterEach(() => {
    __resetSessionRevokedForTests();
    vi.useRealTimers();
  });

  it("401 sem code (backend antigo) desloga; rajada simultânea = 1 signOut", () => {
    const signOut = vi.fn(async () => undefined);
    expect(isSessionEnded()).toBe(false);
    const outcomes = Array.from({ length: 5 }, () => handleUnauthorized(signOut));
    expect(outcomes[0]).toBe("signed-out");
    expect(outcomes.slice(1).every((o) => o === "already-handled")).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(isSessionEnded()).toBe(true);
    expect(window.localStorage.getItem(SESSION_REVOKED_STORAGE_KEY)).not.toBeNull();
  });

  it("várias abas: a segunda (marca no localStorage) não chama o signOut de novo", () => {
    const signOutA = vi.fn(async () => undefined);
    const signOutB = vi.fn(async () => undefined);
    expect(handleUnauthorized(signOutA)).toBe("signed-out");
    __resetSessionRevokedForTests(); // "outra aba": memória nova, mesmo localStorage
    expect(handleUnauthorized(signOutB)).toBe("already-handled");
    expect(signOutB).not.toHaveBeenCalled();
    expect(isSessionEnded()).toBe(true); // os laços desta aba param também
  });

  it("páginas de autenticação e renovação em andamento não deslogam", () => {
    const signOut = vi.fn(async () => undefined);
    window.history.replaceState(null, "", "/login");
    expect(handleUnauthorized(signOut)).toBe("auth-page");
    window.history.replaceState(null, "", "/inbox");
    beginSessionRenewal();
    expect(handleUnauthorized(signOut)).toBe("renewal");
    expect(signOut).not.toHaveBeenCalled();
    expect(isSessionEnded()).toBe(false);
  });

  it("logout de OUTRA aba (evento storage): esta para e vai ao login, sem signOut próprio", async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const signOut = vi.fn(async () => undefined);
    watchSessionEndInOtherTabs(navigate);
    const now = String(Date.now());
    window.localStorage.setItem(SESSION_REVOKED_STORAGE_KEY, now);
    window.dispatchEvent(
      new StorageEvent("storage", { key: SESSION_REVOKED_STORAGE_KEY, newValue: now }),
    );
    expect(isSessionEnded()).toBe(true);
    await vi.advanceTimersByTimeAsync(CROSS_TAB_LOGIN_DELAY_MS - 1);
    expect(navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(navigate).toHaveBeenCalledTimes(1);
    // Um 401 que chegue depois nesta aba não desloga de novo.
    expect(handleUnauthorized(signOut)).toBe("already-handled");
    expect(signOut).not.toHaveBeenCalled();
  });

  it("evento storage antigo (> 60 s) ou em página de login é ignorado", async () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    watchSessionEndInOtherTabs(navigate);
    const old = String(Date.now() - SESSION_REVOKED_GUARD_MS - 1);
    window.dispatchEvent(
      new StorageEvent("storage", { key: SESSION_REVOKED_STORAGE_KEY, newValue: old }),
    );
    window.history.replaceState(null, "", "/login");
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: SESSION_REVOKED_STORAGE_KEY,
        newValue: String(Date.now()),
      }),
    );
    await vi.advanceTimersByTimeAsync(CROSS_TAB_LOGIN_DELAY_MS * 2);
    expect(navigate).not.toHaveBeenCalled();
    expect(isSessionEnded()).toBe(false);
  });
});
