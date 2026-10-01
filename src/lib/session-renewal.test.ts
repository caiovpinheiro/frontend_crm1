/** @vitest-environment jsdom */
/**
 * Renovação da sessão atual após o próprio usuário revogar as demais:
 * a prova devolvida pelo backend vira `update({ sessionRenewal })`, e o
 * signOut automático por 401 `SESSION_REVOKED` fica suspenso enquanto a
 * renovação está em andamento (nesta aba ou em outra).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetSessionRenewalForTests,
  beginSessionRenewal,
  endSessionRenewal,
  isSessionRenewalInProgress,
  parseSessionRenewal,
  renewCurrentSession,
  runWithSessionRenewal,
  SESSION_RENEWAL_GRACE_MS,
  SESSION_RENEWAL_WINDOW_MS,
} from "@/lib/session-renewal";

const STORAGE_KEY = "crm:session-renewal-until";
const GRANT = { token: "prova-de-uso-unico", sessionVersion: 4 };
const RENEWED = { user: { id: "u1", sessionVersion: 4 }, expires: "2099-01-01T00:00:00Z" };

beforeEach(() => {
  __resetSessionRenewalForTests();
  window.localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("parseSessionRenewal", () => {
  it("lê a prova do corpo da resposta", () => {
    expect(
      parseSessionRenewal({
        id: "u1",
        sessionRenewal: { token: "abc", sessionVersion: 4, expiresInSec: 60 },
      }),
    ).toEqual({ token: "abc", sessionVersion: 4 });
  });

  it("corpo sem prova (backend antigo) ou malformado → null", () => {
    for (const payload of [
      null,
      undefined,
      "texto",
      {},
      { ok: true, sessionVersion: 4 },
      { sessionRenewal: null },
      { sessionRenewal: "abc" },
      { sessionRenewal: { token: "", sessionVersion: 4 } },
      { sessionRenewal: { token: "abc" } },
      { sessionRenewal: { token: "abc", sessionVersion: "4" } },
      { sessionRenewal: { token: 1, sessionVersion: 4 } },
    ]) {
      expect(parseSessionRenewal(payload)).toBeNull();
    }
  });
});

describe("marca de renovação em andamento", () => {
  it("begin liga (memória + localStorage); end(false) desliga na hora", () => {
    expect(isSessionRenewalInProgress()).toBe(false);
    beginSessionRenewal();
    expect(isSessionRenewalInProgress()).toBe(true);
    expect(Number(window.localStorage.getItem(STORAGE_KEY))).toBeGreaterThan(Date.now());
    endSessionRenewal(false);
    expect(isSessionRenewalInProgress()).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("end(true) mantém uma folga curta para respostas em voo e depois libera", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-01T12:00:00Z"));
    beginSessionRenewal();
    endSessionRenewal(true);
    vi.setSystemTime(Date.now() + SESSION_RENEWAL_GRACE_MS - 1);
    expect(isSessionRenewalInProgress()).toBe(true);
    vi.setSystemTime(Date.now() + 2);
    expect(isSessionRenewalInProgress()).toBe(false);
  });

  it("tem teto: renovação que nunca termina deixa de suspender o signOut", () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-01T12:00:00Z"));
    beginSessionRenewal();
    vi.setSystemTime(Date.now() + SESSION_RENEWAL_WINDOW_MS + 1);
    expect(isSessionRenewalInProgress()).toBe(false);
  });

  it("outra aba: só o localStorage basta", () => {
    // Esta aba não começou nada; outra aba do navegador anunciou.
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() + 10_000));
    expect(isSessionRenewalInProgress()).toBe(true);
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() - 1));
    expect(isSessionRenewalInProgress()).toBe(false);
  });

  it("valor absurdo no localStorage (além do teto) é ignorado", () => {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now() + 24 * 3600_000));
    expect(isSessionRenewalInProgress()).toBe(false);
    window.localStorage.setItem(STORAGE_KEY, "lixo");
    expect(isSessionRenewalInProgress()).toBe(false);
  });
});

describe("renewCurrentSession", () => {
  it("chama update com a prova e confirma pela versão da sessão devolvida", async () => {
    const update = vi.fn(async () => RENEWED);
    expect(await renewCurrentSession(update, GRANT, 0)).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ sessionRenewal: "prova-de-uso-unico" });
  });

  it("backend recusou (update devolve null): tenta mais uma vez e desiste", async () => {
    const update = vi.fn(async () => null);
    expect(await renewCurrentSession(update, GRANT, 0)).toBe(false);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("SessionProvider ocupado (undefined) na 1ª tentativa: a 2ª renova", async () => {
    const update = vi
      .fn<(data?: unknown) => Promise<unknown>>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(RENEWED);
    expect(await renewCurrentSession(update, GRANT, 0)).toBe(true);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("sessão devolvida em outra versão não conta como renovada", async () => {
    const update = vi.fn(async () => ({ user: { id: "u1", sessionVersion: 3 } }));
    expect(await renewCurrentSession(update, GRANT, 0)).toBe(false);
  });

  it("update que lança é tratado como falha", async () => {
    const update = vi.fn(async () => {
      throw new Error("rede");
    });
    expect(await renewCurrentSession(update, GRANT, 0)).toBe(false);
  });
});

describe("runWithSessionRenewal", () => {
  it("anuncia a renovação ANTES do pedido e renova com a prova da resposta", async () => {
    const seen: boolean[] = [];
    const update = vi.fn(async () => {
      seen.push(isSessionRenewalInProgress());
      return RENEWED;
    });
    const request = vi.fn(async () => {
      seen.push(isSessionRenewalInProgress());
      return { id: "u1", sessionRenewal: { ...GRANT, expiresInSec: 60 } };
    });

    const out = await runWithSessionRenewal(request, update, 0);

    expect(out.session).toBe("kept");
    expect(out.result).toMatchObject({ id: "u1" });
    expect(seen).toEqual([true, true]);
    expect(update).toHaveBeenCalledWith({ sessionRenewal: GRANT.token });
    // Folga para respostas em voo com o cookie antigo.
    expect(isSessionRenewalInProgress()).toBe(true);
  });

  it("resposta sem prova: não chama update e libera o signOut automático", async () => {
    const update = vi.fn(async () => RENEWED);
    const out = await runWithSessionRenewal(async () => ({ id: "u1" }), update, 0);
    expect(out.session).toBe("not_offered");
    expect(update).not.toHaveBeenCalled();
    expect(isSessionRenewalInProgress()).toBe(false);
  });

  it("renovação recusada: sessão perdida e signOut automático liberado", async () => {
    const update = vi.fn(async () => null);
    const out = await runWithSessionRenewal(
      async () => ({ sessionRenewal: GRANT }),
      update,
      0,
    );
    expect(out.session).toBe("lost");
    expect(isSessionRenewalInProgress()).toBe(false);
  });

  it("pedido que falha (ex.: senha atual incorreta): propaga o erro e libera", async () => {
    const update = vi.fn(async () => RENEWED);
    await expect(
      runWithSessionRenewal(
        async () => {
          throw new Error("Senha atual incorreta.");
        },
        update,
        0,
      ),
    ).rejects.toThrow("Senha atual incorreta.");
    expect(update).not.toHaveBeenCalled();
    expect(isSessionRenewalInProgress()).toBe(false);
  });
});
