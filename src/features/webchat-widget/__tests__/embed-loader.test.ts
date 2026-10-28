/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const LOADER = readFileSync(
  path.join(__dirname, "../../../../public/webchat/embed.js"),
  "utf8",
);

function runLoader(key = "wc_abcdefghijklmnopqrstuvwx", version = 1) {
  const s = document.createElement("script");
  s.src = `https://bwipo.com/webchat/embed.js?v=${version}`;
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
    delete (window as unknown as { BwipoWebchatQueue?: unknown }).BwipoWebchatQueue;
  });
  afterEach(() => vi.restoreAllMocks());

  it("monta o iframe da nossa origem com o host do site e a chave", () => {
    runLoader();
    const f = frame();
    expect(f).not.toBeNull();
    expect(f!.src).toBe(
      `https://bwipo.com/webchat/wc_abcdefghijklmnopqrstuvwx?host=${encodeURIComponent(
        window.location.origin,
      )}&v=2`,
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
  it("acessibilidade: título do iframe, foco ao abrir/fechar, Esc e não lidas no rótulo", () => {
    runLoader();
    fromFrame({
      ns: "bwipo:webchat",
      type: "ready",
      theme: { primary: "#0f766e", position: "right", title: "Loja" },
    });
    const f = frame()!;
    const btn = document.querySelector("button")!;
    expect(f.title).toBe("Chat: Loja");

    fromFrame({ ns: "bwipo:webchat", type: "unread", count: 3 });
    expect(btn.getAttribute("aria-label")).toBe("Abrir chat (3 mensagens não lidas)");
    expect(btn.querySelector("span")!.getAttribute("aria-hidden")).toBe("true");
    fromFrame({ ns: "bwipo:webchat", type: "unread", count: 1 });
    expect(btn.getAttribute("aria-label")).toBe("Abrir chat (1 mensagem não lida)");

    const post = vi.spyOn(f.contentWindow!, "postMessage");
    btn.click();
    expect(document.activeElement).toBe(f);
    expect(btn.getAttribute("aria-label")).toBe("Fechar chat");

    // Fechar por dentro do iframe (botão X ou Esc no painel) devolve o foco à bolha.
    fromFrame({ ns: "bwipo:webchat", type: "close" });
    expect(f.style.getPropertyValue("display")).toBe("none");
    expect(document.activeElement).toBe(btn);

    // Esc com o foco na bolha fecha o chat aberto.
    btn.click();
    btn.focus();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(f.style.getPropertyValue("display")).toBe("none");
    expect(post).toHaveBeenLastCalledWith({ ns: "bwipo:webchat", type: "close" }, "https://bwipo.com");
    expect(document.activeElement).toBe(btn);
  });
});
