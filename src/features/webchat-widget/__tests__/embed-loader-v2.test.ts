/** @vitest-environment jsdom */
/**
 * Loader v2 (`public/webchat/embed.js`): API do site (identify, setContext,
 * track, open com prefill/ref, capabilities, ready) e compatibilidade v1.
 * Contrato: backend `docs/decisoes/webchat-widget.md` §9.1/§9.2. Dados neutros.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOADER = readFileSync(path.join(__dirname, "../../../../public/webchat/embed.js"), "utf8");
const NS = "bwipo:webchat";
const BASE = "https://bwipo.com";

type Api = {
  version: number;
  capabilities: Record<string, boolean>;
  open: (o?: unknown) => void;
  close: () => void;
  toggle: () => void;
  identify: (p: unknown) => void;
  setContext: (o: unknown) => void;
  track: (n: unknown, d?: unknown, o?: unknown) => void;
};
const win = window as unknown as { BwipoWebchat?: Api; BwipoWebchatQueue?: unknown };

function runLoader(version = 2) {
  const s = document.createElement("script");
  s.src = `${BASE}/webchat/embed.js?v=${version}`;
  s.setAttribute("data-key", "wc_abcdefghijklmnopqrstuvwx");
  document.head.appendChild(s);
  new Function(LOADER)();
  const frame = document.querySelector("iframe")!;
  const post = vi.spyOn(frame.contentWindow!, "postMessage");
  return { api: win.BwipoWebchat!, frame, post };
}

function fromFrame(frame: HTMLIFrameElement, data: unknown, origin = BASE, source?: unknown) {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin,
      source: (source ?? frame.contentWindow) as MessageEventSource,
    }),
  );
}

type Sent = { type: string } & Record<string, unknown>;
type PostSpy = { mock: { calls: unknown[][] } };
const sent = (post: PostSpy): Sent[] => post.mock.calls.map((c) => c[0] as Sent);
const sentTypes = (post: PostSpy) => sent(post).map((m) => m.type);

const IDENTITY = { externalId: "ext-1", userHash: "a".repeat(64), name: "Pessoa", attributes: { campo: "x", obj: {} } };

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  delete win.BwipoWebchat;
  delete win.BwipoWebchatQueue;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("embed.js v2 — API e capabilities", () => {
  it("version 2, capabilities e o evento ready (uma vez, após o ready do iframe)", () => {
    const onReady = vi.fn();
    window.addEventListener("bwipo:webchat:ready", onReady);
    const { api, frame } = runLoader();
    expect(api.version).toBe(2);
    expect(api.capabilities).toEqual({ prefill: true, identify: true, track: true, context: true });
    expect(onReady).not.toHaveBeenCalled();
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    expect(onReady).toHaveBeenCalledTimes(1);
    expect((onReady.mock.calls[0]![0] as CustomEvent).detail).toEqual({
      version: 2,
      capabilities: { prefill: true, identify: true, track: true, context: true },
    });
    window.removeEventListener("bwipo:webchat:ready", onReady);
  });

  it("BwipoWebchatQueue: chamadas de antes do script saem em ordem; depois, push chama direto", () => {
    win.BwipoWebchatQueue = [
      ["setContext", { etapa: "1" }],
      ["identify", IDENTITY],
      ["track", "evento.a", { k: 1 }],
    ];
    const { frame, post } = runLoader();
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    expect(sentTypes(post)).toEqual(["ack", "identify", "context", "track"]);
    (win.BwipoWebchatQueue as { push: (c: unknown) => void }).push(["setContext", { etapa: "2" }]);
    expect(sent(post).at(-1)).toEqual({ ns: NS, type: "context", context: { etapa: "2" } });
  });
});

describe("embed.js v2 — identify antes e depois do handshake", () => {
  it("antes do handshake: fica na memória e sai depois do ack, primeiro que contexto e eventos", () => {
    const { api, frame, post } = runLoader();
    api.track("antes.do.identify", { passo: 1 });
    api.setContext({ etapa: "a", progresso: 10 });
    api.identify(IDENTITY);
    api.setContext({ etapa: "b", removida: null });
    expect(post).not.toHaveBeenCalled();

    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    const msgs = sent(post);
    expect(msgs.map((m) => m.type)).toEqual(["ack", "identify", "context", "track"]);
    expect(msgs[1]).toEqual({
      ns: NS,
      type: "identify",
      identity: { externalId: "ext-1", userHash: "a".repeat(64), name: "Pessoa", attributes: { campo: "x" } },
    });
    // setContext pendentes fundidos num só (merge raso, null mantido).
    expect(msgs[2]!.context).toEqual({ etapa: "b", progresso: 10, removida: null });
    // Evento de antes do identify não se perde.
    expect((msgs[3]!.events as { name: string }[])[0]!.name).toBe("antes.do.identify");
    for (const [, origin] of post.mock.calls) expect(origin).toBe(BASE);
  });

  it("depois do handshake: sai na hora", () => {
    const { api, frame, post } = runLoader();
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    post.mockClear();
    api.identify({ externalId: 42, userHash: "b".repeat(64) });
    expect(sent(post)).toEqual([
      { ns: NS, type: "identify", identity: { externalId: "42", userHash: "b".repeat(64) } },
    ]);
  });

  it("forma inválida é descartada no loader (sem externalId, grande demais)", () => {
    const { api, frame, post } = runLoader();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    post.mockClear();
    api.identify({ userHash: "x" });
    api.identify({ externalId: "x".repeat(129), userHash: "x" });
    api.identify({ externalId: "ext-1", userHash: "x", name: "n".repeat(200), attributes: Object.fromEntries(
      Array.from({ length: 50 }, (_, i) => [`k${i}`, "v".repeat(1000)]),
    ) });
    expect(post).not.toHaveBeenCalled();
  });

  it("resultado do identify (iframe → loader) vira evento no window do site", () => {
    const onIdentity = vi.fn();
    window.addEventListener("bwipo:webchat:identity", onIdentity);
    const { frame } = runLoader();
    fromFrame(frame, { ns: NS, type: "identity", verified: true });
    // origem errada / outra janela: ignorado
    fromFrame(frame, { ns: NS, type: "identity", verified: true }, "https://outro.example");
    fromFrame(frame, { ns: NS, type: "identity", verified: true }, BASE, window);
    expect(onIdentity).toHaveBeenCalledTimes(1);
    expect((onIdentity.mock.calls[0]![0] as CustomEvent).detail).toEqual({ verified: true });
    window.removeEventListener("bwipo:webchat:identity", onIdentity);
  });
});

describe("embed.js v2 — eventos em lote e página fechando", () => {
  it("lote a cada 5 s ou 20 eventos; fila máxima de 100 (descarta os mais antigos)", () => {
    vi.useFakeTimers();
    const { api, frame, post } = runLoader();
    for (let i = 0; i < 130; i++) api.track(`e${i}`);
    expect(post).not.toHaveBeenCalled();
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    const batches = sent(post).filter((m) => m.type === "track");
    const names = batches.flatMap((b) => (b.events as { name: string }[]).map((e) => e.name));
    expect(names).toHaveLength(100);
    expect(names[0]).toBe("e30");
    expect(batches.every((b) => (b.events as unknown[]).length <= 20)).toBe(true);

    post.mockClear();
    api.track("x", { a: 1 }, { important: true, at: new Date("2026-10-28T10:00:00Z") });
    expect(post).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(sent(post)).toEqual([
      {
        ns: NS,
        type: "track",
        events: [{ name: "x", data: { a: 1 }, important: true, at: Date.parse("2026-10-28T10:00:00Z") }],
      },
    ]);
    post.mockClear();
    for (let i = 0; i < 20; i++) api.track(`l${i}`);
    expect(sentTypes(post)).toEqual(["track"]);
  });

  it("pagehide: manda os eventos pendentes e pede flush (keepalive) ao iframe", () => {
    const { api, frame, post } = runLoader();
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    post.mockClear();
    api.track("saindo");
    window.dispatchEvent(new Event("pagehide"));
    expect(sentTypes(post)).toEqual(["track", "flush"]);
  });
});

describe("embed.js v2 — open com prefill e ref", () => {
  it("open({ message, ref }) antes do ready: aplica no ready; abre sem enviar a mensagem", () => {
    const { api, frame, post } = runLoader();
    api.open({ message: "Texto pronto", ref: "REF-1" });
    expect(frame.style.getPropertyValue("display")).toBe("none");
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    expect(frame.style.getPropertyValue("display")).toBe("block");
    expect(sent(post).at(-1)).toEqual({ ns: NS, type: "open", message: "Texto pronto", ref: "REF-1" });
  });

  it("open({ message }) com o widget pronto; ref inválido (> 128) é ignorado; message cortada em 4000", () => {
    const { api, frame, post } = runLoader();
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    api.open({ message: "m".repeat(5000), ref: "r".repeat(129) });
    const last = sent(post).at(-1)!;
    expect(last.type).toBe("open");
    expect((last.message as string).length).toBe(4000);
    expect(last.ref).toBeUndefined();
  });
});

describe("embed.js v2 — compatibilidade v1", () => {
  it("site v1 (snippet ?v=1, só open/close/toggle) segue igual", () => {
    const { api, frame, post } = runLoader(1);
    fromFrame(frame, { ns: NS, type: "hello", protocol: 2 });
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    post.mockClear();
    api.open();
    expect(sent(post)).toEqual([{ ns: NS, type: "open" }]);
    expect(frame.style.getPropertyValue("display")).toBe("block");
    api.toggle();
    expect(sent(post).at(-1)).toEqual({ ns: NS, type: "close" });
    api.toggle();
    expect(sent(post).at(-1)).toEqual({ ns: NS, type: "open" });
    api.close();
    expect(sent(post).at(-1)).toEqual({ ns: NS, type: "close" });
  });

  it("open() sem argumento antes do ready continua ignorado (como na v1)", () => {
    const { api, frame } = runLoader(1);
    api.open();
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    expect(frame.style.getPropertyValue("display")).toBe("none");
  });

  it("iframe v1 (hello sem protocol): nada da v2 é enviado; open sem campos", () => {
    const { api, frame, post } = runLoader();
    api.identify(IDENTITY);
    api.setContext({ etapa: "a" });
    api.track("x");
    fromFrame(frame, { ns: NS, type: "hello" });
    fromFrame(frame, { ns: NS, type: "ready", theme: {} });
    api.open({ message: "Texto", ref: "REF-1" });
    window.dispatchEvent(new Event("pagehide"));
    expect(sentTypes(post)).toEqual(["ack", "open"]);
    expect(sent(post)[1]).toEqual({ ns: NS, type: "open" });
  });
});
