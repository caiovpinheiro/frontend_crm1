/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOADER = readFileSync(
  path.join(__dirname, "../../../../public/webchat/embed.js"),
  "utf8",
);

function runLoader(key = "wc_abcdefghijklmnopqrstuvwx") {
  const s = document.createElement("script");
  s.src = "https://bwipo.com/webchat/embed.js?v=1";
  s.setAttribute("data-key", key);
  document.head.appendChild(s);
  new Function(LOADER)();
}

function frame(): HTMLIFrameElement | null {
  return document.querySelector("iframe");
}

function fromFrame(data: unknown, origin = "https://bwipo.com") {
  window.dispatchEvent(
    new MessageEvent("message", {
      data,
      origin,
      source: frame()!.contentWindow,
    }),
  );
}

describe("public/webchat/embed.js", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    delete (window as unknown as { BwipoWebchat?: unknown }).BwipoWebchat;
  });
  afterEach(() => vi.restoreAllMocks());

  it("monta o iframe da nossa origem com o host do site e a chave", () => {
    runLoader();
    const f = frame();
    expect(f).not.toBeNull();
    expect(f!.src).toBe(
      `https://bwipo.com/webchat/wc_abcdefghijklmnopqrstuvwx?host=${encodeURIComponent(
        window.location.origin,
      )}&v=1`,
    );
    // Oculto até o iframe aprovar a origem (mensagem `ready`).
    expect(f!.style.getPropertyValue("display")).toBe("none");
    const btn = document.querySelector("button")!;
    expect(btn.style.getPropertyValue("display")).toBe("none");
  });

  it("ignora data-key inválida", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    runLoader("nao-e-chave");
    expect(frame()).toBeNull();
  });

  it("handshake: responde `ack` só para o iframe e mostra a bolha no `ready`", () => {
    runLoader();
    const post = vi.spyOn(frame()!.contentWindow!, "postMessage");
    fromFrame({ ns: "bwipo:webchat", type: "hello" });
    expect(post).toHaveBeenCalledWith(
      expect.objectContaining({ ns: "bwipo:webchat", type: "ack" }),
      "https://bwipo.com",
    );

    fromFrame({
      ns: "bwipo:webchat",
      type: "ready",
      theme: { primary: "#0f766e", position: "left", title: "Loja" },
    });
    const btn = document.querySelector("button")!;
    expect(btn.style.getPropertyValue("display")).toBe("flex");
    expect(btn.style.getPropertyValue("left")).toBe("20px");

    btn.click();
    expect(frame()!.style.getPropertyValue("display")).toBe("block");
    expect(post).toHaveBeenCalledWith({ ns: "bwipo:webchat", type: "open" }, "https://bwipo.com");
  });

  it("descarta mensagens de outra origem", () => {
    runLoader();
    fromFrame({ ns: "bwipo:webchat", type: "ready", theme: {} }, "https://evil.example");
    expect(document.querySelector("button")!.style.getPropertyValue("display")).toBe("none");
  });

  it("badge de não lidas", () => {
    runLoader();
    fromFrame({ ns: "bwipo:webchat", type: "ready", theme: {} });
    fromFrame({ ns: "bwipo:webchat", type: "unread", count: 3 });
    const badge = document.querySelector("button span") as HTMLElement;
    expect(badge.textContent).toBe("3");
    expect(badge.style.getPropertyValue("display")).toBe("block");
  });
});
