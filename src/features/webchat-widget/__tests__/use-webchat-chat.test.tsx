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

import { POLL_CLOSED_MS, POLL_OPEN_MS, storageKey, useWebchatChat } from "../use-webchat-chat";

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
});
