/** @vitest-environment jsdom */
/**
 * Webchat v2 do lado do iframe: ponte com o loader (origem/fonte, fila antes
 * do assinante, formato), envio para a API (identify primeiro, contexto
 * fundido, lotes, TRACKING_DISABLED, página fechando) e prefill do painel.
 * Contrato: backend `docs/decisoes/webchat-widget.md` §9. Dados neutros.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebchatApiError } from "../api";
import type { WebchatIdentifyPayload, WebchatTrackEvent } from "../protocol";
import {
  createLoaderBridge,
  parseBridgeMessage,
  parseOpenMessage,
  type BridgeMessage,
} from "../site-bridge";
import { SITE_BATCH_MAX, SITE_QUEUE_MAX, SiteSync, type SiteSyncDeps } from "../site-sync";
import { normalizePublicConfig } from "../types";
import { WebchatPanel, type WebchatPanelProps } from "../webchat-panel";

const NS = "bwipo:webchat";
const HOST = "https://site.exemplo.test";
const ID: WebchatIdentifyPayload = { externalId: "ext-1", userHash: "a".repeat(64) };

describe("parseBridgeMessage / parseOpenMessage", () => {
  it("aceita só o formato do contrato", () => {
    expect(parseBridgeMessage({ ns: NS, type: "identify", identity: { ...ID, attributes: { campo: "x", o: {} } } }))
      .toEqual({ type: "identify", identity: { ...ID, attributes: { campo: "x" } } });
    expect(parseBridgeMessage({ ns: NS, type: "identify", identity: { userHash: "x" } })).toBeNull();
    expect(
      parseBridgeMessage({ ns: NS, type: "identify", identity: { ...ID, name: "n".repeat(9000) } }),
    ).toBeNull();
    expect(parseBridgeMessage({ ns: NS, type: "context", context: { etapa: "a", n: 1, x: null, o: [1] } }))
      .toEqual({ type: "context", context: { etapa: "a", n: 1, x: null } });
    expect(parseBridgeMessage({ ns: NS, type: "track", events: [{ name: "a", at: 5 }, { nope: 1 }] }))
      .toEqual({ type: "track", events: [{ name: "a", at: 5 }] });
    expect(parseBridgeMessage({ ns: NS, type: "flush" })).toEqual({ type: "flush" });
    expect(parseBridgeMessage({ ns: "outro", type: "flush" })).toBeNull();
    expect(parseBridgeMessage({ ns: NS, type: "open" })).toBeNull();
  });

  it("open v1 (sem campos) e v2 (message + ref)", () => {
    expect(parseOpenMessage({ ns: NS, type: "open" })).toEqual({});
    expect(parseOpenMessage({ ns: NS, type: "open", message: "Oi", ref: "REF-1" })).toEqual({
      message: "Oi",
      ref: "REF-1",
    });
    expect(parseOpenMessage({ ns: NS, type: "open", ref: "r".repeat(129) })).toEqual({});
    expect(parseOpenMessage({ ns: NS, type: "close" })).toBeNull();
  });
});

describe("createLoaderBridge", () => {
  function fakeWindow() {
    const target = new EventTarget() as EventTarget & { parent: object };
    target.parent = {};
    const emit = (data: unknown, origin = HOST, source: unknown = target.parent) =>
      target.dispatchEvent(Object.assign(new Event("message"), { data, origin, source }));
    return { win: target as unknown as Window, emit };
  }

  it("guarda o que chega antes do assinante e entrega em ordem; depois, direto", () => {
    const { win, emit } = fakeWindow();
    const bridge = createLoaderBridge(HOST, win);
    emit({ ns: NS, type: "identify", identity: ID });
    emit({ ns: NS, type: "context", context: { etapa: "a" } });
    const got: BridgeMessage[] = [];
    bridge.subscribe((m) => got.push(m));
    emit({ ns: NS, type: "flush" });
    expect(got.map((m) => m.type)).toEqual(["identify", "context", "flush"]);
    bridge.dispose();
  });

  it("confere event.origin e event.source", () => {
    const { win, emit } = fakeWindow();
    const bridge = createLoaderBridge(HOST, win);
    const got: BridgeMessage[] = [];
    bridge.subscribe((m) => got.push(m));
    emit({ ns: NS, type: "flush" }, "https://outro.exemplo.test");
    emit({ ns: NS, type: "flush" }, HOST, {});
    expect(got).toEqual([]);
    bridge.dispose();
  });
});

describe("SiteSync", () => {
  function setup(over: Partial<SiteSyncDeps> = {}) {
    const timers: { fn: () => void; ms: number }[] = [];
    const calls: string[] = [];
    const deps: SiteSyncDeps = {
      identify: vi.fn(async () => {
        calls.push("identify");
        return { verified: true };
      }),
      withToken: async (fn) => fn("tok-1"),
      postContext: vi.fn(async (_t, ctx) => {
        calls.push(`context:${JSON.stringify(ctx)}`);
      }),
      postEvents: vi.fn(async (_t, evs: WebchatTrackEvent[]) => {
        calls.push(`events:${evs.length}`);
      }),
      onIdentity: vi.fn(),
      setTimer: (fn, ms) => {
        const t = { fn, ms };
        timers.push(t);
        return t;
      },
      clearTimer: (h) => {
        const i = timers.indexOf(h as (typeof timers)[number]);
        if (i >= 0) timers.splice(i, 1);
      },
      ...over,
    };
    const sync = new SiteSync(deps);
    /** Dispara os timers pendentes (até `max` rodadas: o retry reagenda). */
    const runTimers = async (max = 20) => {
      for (let i = 0; i < max && timers.length; i++) {
        const t = timers.shift()!;
        t.fn();
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    return { sync, deps, calls, runTimers, timers };
  }

  it("identify primeiro; contexto fundido; eventos em lotes de até 20", async () => {
    const { sync, deps, calls, runTimers } = setup();
    sync.track([{ name: "antes" }]);
    sync.setContext({ etapa: "a", n: 1 });
    void sync.identify(ID);
    sync.setContext({ etapa: "b" });
    sync.track(Array.from({ length: 25 }, (_, i) => ({ name: `e${i}` })));
    await runTimers();
    expect(calls).toEqual(['identify', 'context:{"etapa":"b","n":1}', "events:20", "events:6"]);
    expect(deps.onIdentity).toHaveBeenCalledWith(true);
  });

  it("fila limitada a 100 eventos (descarta os mais antigos)", () => {
    const { sync } = setup();
    sync.track(Array.from({ length: SITE_QUEUE_MAX + 30 }, (_, i) => ({ name: `e${i}` })));
    expect(sync.pending().events).toBe(SITE_QUEUE_MAX);
    expect(SITE_BATCH_MAX).toBe(20);
  });

  it("403 TRACKING_DISABLED: para até o próximo identify (guarda o pendente)", async () => {
    let allow = false;
    const disabled = new WebchatApiError("off", 403, "TRACKING_DISABLED");
    const { sync, deps, runTimers } = setup({
      postContext: vi.fn(async () => {
        if (!allow) throw disabled;
      }),
    });
    sync.setContext({ etapa: "a" });
    sync.track([{ name: "x" }]);
    await runTimers();
    expect(sync.pending()).toMatchObject({ disabled: true, context: { etapa: "a" }, events: 1 });
    sync.setContext({ etapa: "b" });
    await runTimers();
    expect(deps.postContext).toHaveBeenCalledTimes(1);

    allow = true;
    await sync.identify(ID);
    await runTimers();
    expect(deps.postContext).toHaveBeenLastCalledWith("tok-1", { etapa: "b" }, false);
    expect(deps.postEvents).toHaveBeenCalledWith("tok-1", [{ name: "x" }], false);
    expect(sync.pending()).toMatchObject({ disabled: false, context: null, events: 0 });
  });

  it("falha transitória guarda e tenta de novo; flush manda com keepalive", async () => {
    let fail = true;
    const { sync, deps, runTimers, timers } = setup({
      postEvents: vi.fn(async () => {
        if (fail) throw new WebchatApiError("x", 503, null);
      }),
    });
    sync.track([{ name: "a" }]);
    await runTimers(1);
    expect(sync.pending().events).toBe(1);
    // Reagendou a nova tentativa.
    expect(timers.map((t) => t.ms)).toEqual([15_000]);
    fail = false;
    await sync.flush();
    expect(deps.postEvents).toHaveBeenLastCalledWith("tok-1", [{ name: "a" }], true);
    expect(sync.pending().events).toBe(0);
  });

  it("identify inválido avisa o loader com verified=false", async () => {
    const { sync, deps } = setup({
      identify: vi.fn(async () => ({ verified: false, reason: "SIGNATURE_INVALID" as const })),
    });
    await sync.identify(ID);
    expect(deps.onIdentity).toHaveBeenCalledWith(false);
  });
});

describe("WebchatPanel — prefill do site", () => {
  afterEach(cleanup);
  const KEY = "wc_abcdefghijklmnopqrstuvwx";
  function renderPanel(props: Partial<WebchatPanelProps> = {}) {
    const base: WebchatPanelProps = {
      config: normalizePublicConfig({ theme: { title: "Loja" } }, KEY),
      variant: "embedded",
      view: "chat",
      messages: [],
      agentTyping: false,
      agentReadAt: null,
      onSend: vi.fn(),
      onRetry: vi.fn(),
      onTyping: vi.fn(),
      onIdentify: vi.fn(async () => {}),
      onOfflineSubmit: vi.fn(async () => {}),
    };
    return render(<WebchatPanel {...base} {...props} />);
  }

  it("preenche o campo sem enviar; o visitante edita e envia o texto editado", async () => {
    const onSend = vi.fn();
    const { rerender } = renderPanel({ onSend, prefill: { text: "Texto pronto", seq: 1 } });
    const box = screen.getByLabelText("Mensagem") as HTMLTextAreaElement;
    expect(box.value).toBe("Texto pronto");
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(document.activeElement).toBe(box);

    fireEvent.change(box, { target: { value: "Texto pronto, editado" } });
    fireEvent.submit(box.closest("form")!);
    expect(onSend).toHaveBeenCalledWith("Texto pronto, editado");

    // Novo pedido do site (seq novo) preenche de novo.
    rerender(
      <WebchatPanel
        config={normalizePublicConfig({ theme: { title: "Loja" } }, KEY)}
        variant="embedded"
        view="chat"
        messages={[]}
        agentTyping={false}
        agentReadAt={null}
        onSend={onSend}
        onRetry={vi.fn()}
        onTyping={vi.fn()}
        onIdentify={vi.fn(async () => {})}
        onOfflineSubmit={vi.fn(async () => {})}
        prefill={{ text: "Outro", seq: 2 }}
      />,
    );
    expect((screen.getByLabelText("Mensagem") as HTMLTextAreaElement).value).toBe("Outro");
  });
});
