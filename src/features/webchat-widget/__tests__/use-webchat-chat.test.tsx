/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createWebchatSession: vi.fn(),
  identifyWebchatVisitor: vi.fn(),
  markWebchatRead: vi.fn(),
  pollWebchatMessages: vi.fn(),
  sendWebchatMessage: vi.fn(),
  sendWebchatTyping: vi.fn(),
}));
vi.mock("../api", async (orig) => ({ ...(await orig<typeof import("../api")>()), ...api }));

import { WebchatApiError } from "../api";
import {
  mergeMessages,
  POLL_CLOSED_MS,
  POLL_OPEN_MS,
  storageKey,
  useWebchatChat,
} from "../use-webchat-chat";

const KEY = "wc_abcdefghijklmnopqrstuvwx";

// Node 25 expõe um `localStorage` global vazio (sem `--localstorage-file`)
// que encobre o do jsdom — storage em memória só para este teste.
function installMemoryStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v)),
    removeItem: (k: string) => void data.delete(k),
    clear: () => data.clear(),
    key: (i: number) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
  Object.defineProperty(window, "localStorage", { value: storage, configurable: true });
}
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function setup(opts: { panelVisible?: boolean } = {}) {
  return renderHook(
    (p: { panelVisible: boolean }) =>
      useWebchatChat({
        publicKey: KEY,
        enabled: true,
        panelVisible: p.panelVisible,
        host: "https://www.cliente.com.br",
        pageInfo: { page: "https://www.cliente.com.br/?utm_source=google", referrer: "" },
      }),
    { initialProps: { panelVisible: opts.panelVisible ?? true } },
  );
}

const flush = () => act(async () => {});

const seed = (v: Record<string, unknown>) =>
  window.localStorage.setItem(storageKey(KEY), JSON.stringify(v));
const disk = () => {
  const raw = window.localStorage.getItem(storageKey(KEY));
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
};
const unauthorized = () => new WebchatApiError("token inválido", 401, "TOKEN_INVALID");
const EMPTY_POLL = { messages: [], cursor: null, agentTyping: false, agentReadAt: null };

describe("useWebchatChat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installMemoryStorage();
    for (const fn of Object.values(api)) fn.mockReset();
    api.pollWebchatMessages.mockResolvedValue({
      messages: [],
      cursor: null,
      agentTyping: false,
      agentReadAt: null,
    });
    api.sendWebchatTyping.mockResolvedValue(undefined);
    api.markWebchatRead.mockResolvedValue(undefined);
    // Renovação do token salvo (a cada carga): mesmo visitante, token novo.
    api.createWebchatSession.mockResolvedValue({
      token: "tok2",
      visitorId: "vis1",
      contactId: "c1",
      conversationId: "cv1",
      identified: false,
      contact: null,
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("cria sessão no 1º envio e manda clientMessageId (uuid) com envio otimista", async () => {
    api.createWebchatSession.mockResolvedValue({
      token: "tok1",
      visitorId: "vis1",
      contactId: "c1",
      conversationId: null,
      identified: false,
      contact: null,
    });
    let resolveSend: (v: unknown) => void = () => {};
    api.sendWebchatMessage.mockReturnValue(new Promise((r) => (resolveSend = r)));

    const { result } = setup();
    await flush();
    expect(api.pollWebchatMessages).not.toHaveBeenCalled(); // sem sessão, sem polling

    let sent: Promise<boolean> = Promise.resolve(false);
    act(() => {
      sent = result.current.send("  Olá!  ");
    });
    // Otimista: aparece na hora, pendente.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ content: "Olá!", local: "pending" });
    await flush();

    expect(api.createWebchatSession).toHaveBeenCalledWith(
      expect.objectContaining({
        key: KEY,
        host: "https://www.cliente.com.br",
        utm: { utm_source: "google" },
      }),
      undefined,
    );
    const [token, body] = api.sendWebchatMessage.mock.calls[0]!;
    expect(token).toBe("tok1");
    expect(body.content).toBe("Olá!");
    expect(body.clientMessageId).toMatch(UUID_RE);
    expect(result.current.messages[0]!.clientMessageId).toBe(body.clientMessageId);

    await act(async () => {
      resolveSend({
        id: "m1",
        clientMessageId: body.clientMessageId,
        direction: "in",
        content: "Olá!",
        createdAt: "2026-10-17T12:00:00.000Z",
        status: "sent",
      });
      await sent;
    });
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0]).toMatchObject({ id: "m1", status: "sent" });
    expect(result.current.messages[0]!.local).toBeUndefined();
    expect(JSON.parse(window.localStorage.getItem(storageKey(KEY))!)).toMatchObject({
      token: "tok1",
      visitorId: "vis1",
    });
  });

  it("polling a cada 3 s com cursor `after`, 10 s com o painel fechado", async () => {
    window.localStorage.setItem(
      storageKey(KEY),
      JSON.stringify({ token: "tok1", visitorId: "vis1", identified: false }),
    );
    api.pollWebchatMessages.mockResolvedValueOnce({
      messages: [
        {
          id: "o1",
          direction: "out",
          content: "Oi, posso ajudar?",
          createdAt: "2026-10-17T12:00:00.000Z",
          senderName: "Ana",
        },
      ],
      cursor: "cur-1",
      agentTyping: true,
      agentReadAt: null,
    });

    const { result, rerender } = setup({ panelVisible: true });
    await flush();
    // Renova com o Bearer salvo ANTES do 1º poll, que já usa o token novo.
    expect(api.createWebchatSession).toHaveBeenCalledWith(
      expect.objectContaining({ key: KEY }),
      "tok1",
    );
    expect(api.pollWebchatMessages).toHaveBeenNthCalledWith(1, "tok2", null);
    expect(result.current.messages.map((m) => m.id)).toEqual(["o1"]);
    expect(result.current.agentTyping).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
    });
    expect(api.pollWebchatMessages).toHaveBeenNthCalledWith(2, "tok2", "cur-1");

    rerender({ panelVisible: false });
    // O tick já agendado (3 s) ainda roda; os seguintes saem a cada 10 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
    });
    const calls = api.pollWebchatMessages.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
    });
    expect(api.pollWebchatMessages.mock.calls.length).toBe(calls);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_CLOSED_MS - POLL_OPEN_MS);
    });
    expect(api.pollWebchatMessages.mock.calls.length).toBe(calls + 1);
  });

  it("marca como lida as respostas do agente com o painel visível", async () => {
    window.localStorage.setItem(
      storageKey(KEY),
      JSON.stringify({ token: "tok1", visitorId: "vis1", identified: false }),
    );
    api.pollWebchatMessages.mockResolvedValueOnce({
      messages: [
        { id: "o1", direction: "out", content: "Oi", createdAt: "2026-10-17T12:00:00.000Z" },
      ],
      cursor: "cur-1",
      agentTyping: false,
      agentReadAt: null,
    });
    const { result, rerender } = setup({ panelVisible: false });
    await flush();
    expect(result.current.unreadCount).toBe(1);
    expect(api.markWebchatRead).not.toHaveBeenCalled();

    rerender({ panelVisible: true });
    await flush();
    expect(api.markWebchatRead).toHaveBeenCalledWith("tok2");
    expect(result.current.unreadCount).toBe(0);
  });

  it("typing: envia `true` com throttle e `false` ao parar", async () => {
    window.localStorage.setItem(
      storageKey(KEY),
      JSON.stringify({ token: "tok1", visitorId: "vis1", identified: false }),
    );
    const { result } = setup();
    await flush();
    act(() => {
      result.current.notifyTyping();
      result.current.notifyTyping();
    });
    expect(api.sendWebchatTyping).toHaveBeenCalledTimes(1);
    expect(api.sendWebchatTyping).toHaveBeenLastCalledWith("tok2", true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });
    expect(api.sendWebchatTyping).toHaveBeenLastCalledWith("tok2", false);
  });

  it("identify troca o token salvo pelo que o backend devolve", async () => {
    window.localStorage.setItem(
      storageKey(KEY),
      JSON.stringify({ token: "tok1", visitorId: "vis1", identified: false }),
    );
    api.identifyWebchatVisitor.mockResolvedValue({ contactId: "c9", merged: true, token: "tok3" });
    const { result } = setup();
    await flush();
    await act(async () => {
      await result.current.identify({ name: " Ana ", email: "ana@ex.com" });
    });
    expect(api.identifyWebchatVisitor).toHaveBeenCalledWith("tok2", {
      name: "Ana",
      email: "ana@ex.com",
    });
    expect(JSON.parse(window.localStorage.getItem(storageKey(KEY))!)).toMatchObject({
      token: "tok3",
      identified: true,
      name: "Ana",
    });
  });

  it("token não renovável (401) → sessão nova, sem polling com o token velho", async () => {
    window.localStorage.setItem(
      storageKey(KEY),
      JSON.stringify({ token: "old", visitorId: "vis0", identified: true, name: "X" }),
    );
    const { WebchatApiError } = await import("../api");
    api.createWebchatSession
      .mockRejectedValueOnce(new WebchatApiError("expirado", 401, "TOKEN_INVALID"))
      .mockResolvedValueOnce({
        token: "new",
        visitorId: "vis5",
        contactId: null,
        conversationId: null,
        identified: false,
        contact: null,
      });
    const { result } = setup();
    await flush();
    expect(api.createWebchatSession).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: KEY }),
      null,
    );
    expect(api.pollWebchatMessages.mock.calls.every(([t]) => t !== "old")).toBe(true);
    expect(result.current.session).toMatchObject({ visitorId: "vis5", identified: false });
    expect(result.current.session?.name).toBeUndefined();
  });
  describe("token rotativo (várias abas / bfcache / identify)", () => {
    it("renovação 401 com token mais novo no disco (outra aba) → adota, sem sessão nova", async () => {
      seed({ token: "tok1", visitorId: "vis1", identified: true, name: "Ana" });
      api.createWebchatSession.mockImplementationOnce(async () => {
        // A outra aba renovou primeiro: o tok1 já não vale.
        seed({ token: "tokB", visitorId: "vis1", identified: true, name: "Ana" });
        throw unauthorized();
      });
      const { result } = setup();
      await flush();
      expect(api.createWebchatSession).toHaveBeenCalledTimes(1);
      expect(result.current.session).toMatchObject({ token: "tokB", visitorId: "vis1", name: "Ana" });
      expect(api.pollWebchatMessages).toHaveBeenCalledWith("tokB", null);
      expect(disk()).toMatchObject({ token: "tokB", visitorId: "vis1" });
    });

    it("poll 401 com token mais novo no disco → tenta de novo com ele e mantém a conversa", async () => {
      seed({ token: "tok1", visitorId: "vis1", identified: false });
      api.pollWebchatMessages
        .mockImplementationOnce(async () => {
          seed({ token: "tokC", visitorId: "vis1", identified: false });
          throw unauthorized();
        })
        .mockResolvedValueOnce({
          ...EMPTY_POLL,
          messages: [{ id: "o1", direction: "out", content: "Oi", createdAt: "2026-10-17T12:00:00Z" }],
        });
      const { result } = setup();
      await flush();
      expect(api.pollWebchatMessages.mock.calls.map(([t]) => t)).toEqual(["tok2", "tokC"]);
      expect(result.current.session?.token).toBe("tokC");
      expect(result.current.messages.map((m) => m.id)).toEqual(["o1"]);
      expect(disk()).toMatchObject({ token: "tokC" });
    });

    it("poll 401 com o MESMO token no disco → zera a sessão e apaga o disco", async () => {
      seed({ token: "tok1", visitorId: "vis1", identified: false });
      api.pollWebchatMessages.mockRejectedValue(unauthorized());
      const { result } = setup();
      await flush();
      expect(result.current.session).toBeNull();
      expect(result.current.historyLoaded).toBe(true);
      expect(disk()).toBeNull();
    });

    it("evento `storage` de outra aba → o próximo poll já usa o token novo", async () => {
      seed({ token: "tok1", visitorId: "vis1", identified: false });
      const { result } = setup();
      await flush();
      expect(api.pollWebchatMessages).toHaveBeenLastCalledWith("tok2", null);
      act(() => {
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: storageKey(KEY),
            newValue: JSON.stringify({ token: "tokS", visitorId: "vis1", identified: true }),
          }),
        );
      });
      expect(result.current.session).toMatchObject({ token: "tokS", identified: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
      });
      expect(api.pollWebchatMessages).toHaveBeenLastCalledWith("tokS", null);
    });

    it("identify durante um poll em voo: o 401 do token velho tenta de novo com o novo", async () => {
      seed({ token: "tok1", visitorId: "vis1", identified: false });
      const { result } = setup();
      await flush();
      let rejectPoll: (e: unknown) => void = () => {};
      api.pollWebchatMessages.mockImplementationOnce(
        () => new Promise((_, reject) => (rejectPoll = reject)),
      );
      await act(async () => {
        await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
      });
      expect(api.pollWebchatMessages).toHaveBeenLastCalledWith("tok2", null);

      api.identifyWebchatVisitor.mockResolvedValue({ contactId: "c1", merged: false, token: "tok3" });
      await act(async () => {
        await result.current.identify({ name: "Ana" });
      });
      await act(async () => {
        rejectPoll(unauthorized());
      });
      await flush();
      expect(api.pollWebchatMessages).toHaveBeenLastCalledWith("tok3", null);
      expect(result.current.session).toMatchObject({
        token: "tok3",
        visitorId: "vis1",
        identified: true,
      });
      expect(disk()).toMatchObject({ token: "tok3", name: "Ana" });
    });

    it("envio com 401 e token mais novo no disco → reenvia com ele (não marca falha)", async () => {
      seed({ token: "tok1", visitorId: "vis1", identified: false });
      const { result } = setup();
      await flush();
      api.sendWebchatMessage
        .mockImplementationOnce(async () => {
          seed({ token: "tokD", visitorId: "vis1", identified: false });
          throw unauthorized();
        })
        .mockResolvedValueOnce(null);
      await act(async () => {
        await result.current.send("Oi");
      });
      expect(api.sendWebchatMessage.mock.calls.map(([t]) => t)).toEqual(["tok2", "tokD"]);
      expect(result.current.messages[0]?.local).toBeUndefined();
    });
  });

  it("backend fora do ar: `connectionError` e backoff exponencial com jitter; volta ao normal", async () => {
    seed({ token: "tok1", visitorId: "vis1", identified: false });
    const random = vi.spyOn(Math, "random").mockReturnValue(1);
    api.pollWebchatMessages.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = setup({ panelVisible: true });
    await flush();
    expect(result.current.connectionError).toBe(true);
    expect(result.current.historyLoaded).toBe(false);
    expect(api.pollWebchatMessages).toHaveBeenCalledTimes(1);

    // 1ª falha: 2 × 3 s (jitter no máximo) em vez dos 3 s de sempre.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
    });
    expect(api.pollWebchatMessages).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
    });
    expect(api.pollWebchatMessages).toHaveBeenCalledTimes(2);

    // 2ª falha: 12 s.
    api.pollWebchatMessages.mockResolvedValue(EMPTY_POLL);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(api.pollWebchatMessages).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(api.pollWebchatMessages).toHaveBeenCalledTimes(3);
    expect(result.current.connectionError).toBe(false);
    expect(result.current.historyLoaded).toBe(true);

    // De volta ao intervalo normal.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_OPEN_MS);
    });
    expect(api.pollWebchatMessages).toHaveBeenCalledTimes(4);
    random.mockRestore();
  });

  it("ordena pelo instante, não pela string ISO (frações e fuso)", () => {
    const at = (id: string, createdAt: string) =>
      ({ id, direction: "out", content: id, createdAt }) as const;
    const merged = mergeMessages(
      [],
      [
        at("meio-seg", "2026-10-17T12:00:00.500Z"),
        at("fuso", "2026-10-17T09:30:00-03:00"), // 12:30Z
        at("cheio", "2026-10-17T12:00:00Z"),
      ],
    );
    expect(merged.map((m) => m.id)).toEqual(["cheio", "meio-seg", "fuso"]);
  });
});
