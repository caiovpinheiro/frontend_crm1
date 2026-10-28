/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizePublicConfig, safeAvatarUrl } from "../types";
import { RECONNECTING_TEXT, WebchatPanel, type WebchatPanelProps } from "../webchat-panel";

const KEY = "wc_abcdefghijklmnopqrstuvwx";

function renderPanel(props: Partial<WebchatPanelProps> = {}) {
  const base: WebchatPanelProps = {
    config: normalizePublicConfig({ theme: { title: "Loja" } }, KEY),
    variant: "embedded",
    view: "chat",
    messages: [],
    agentTyping: false,
    agentReadAt: null,
    onClose: vi.fn(),
    onSend: vi.fn(),
    onRetry: vi.fn(),
    onTyping: vi.fn(),
    onIdentify: vi.fn(async () => {}),
    onOfflineSubmit: vi.fn(async () => {}),
  };
  return render(<WebchatPanel {...base} {...props} />);
}

describe("WebchatPanel (acessibilidade e estados)", () => {
  afterEach(cleanup);

  it("diálogo modal com o título do canal e foco ao abrir", () => {
    renderPanel({ open: true });
    const dialog = screen.getByRole("dialog", { name: "Loja" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(dialog);
  });

  it("prévia do CRM não é modal nem rouba o foco", () => {
    renderPanel({ variant: "preview", open: true });
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(document.activeElement).not.toBe(dialog);
  });

  it("Esc fecha o painel embutido", () => {
    const onClose = vi.fn();
    renderPanel({ open: true, onClose });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("digitando: anunciado em role=status (os pontinhos ficam fora da árvore)", () => {
    renderPanel({ agentTyping: true });
    expect(screen.getByRole("status").textContent).toBe("Atendente digitando…");
  });

  it("sem conexão: aviso na conversa e no lugar do 'Carregando…'", () => {
    const { unmount } = renderPanel({ connectionError: true });
    expect(screen.getAllByText(RECONNECTING_TEXT).length).toBeGreaterThan(0);
    unmount();
    renderPanel({ view: "reconnecting" });
    expect(screen.queryByText("Carregando…")).toBeNull();
    expect(screen.getAllByText(RECONNECTING_TEXT).length).toBeGreaterThan(0);
  });

  it("recibo 'Lida' compara instantes (fuso diferente do agentReadAt)", () => {
    renderPanel({
      messages: [
        {
          id: "m1",
          direction: "in",
          content: "Oi",
          createdAt: "2026-10-17T12:00:00.000Z",
          status: "sent",
        },
      ],
      // 12:00:30Z — depois da mensagem (12:00Z), mas "menor" como string.
      agentReadAt: "2026-10-17T09:00:30-03:00",
    });
    expect(screen.getByText(/Lida/)).toBeTruthy();
  });
});

describe("safeAvatarUrl", () => {
  it("só https absoluta ou caminho same-origin", () => {
    expect(safeAvatarUrl("https://cdn.test/a.png")).toBe("https://cdn.test/a.png");
    expect(safeAvatarUrl("/uploads/a.png")).toBe("/uploads/a.png");
    expect(safeAvatarUrl("http://cdn.test/a.png")).toBeNull();
    expect(safeAvatarUrl("//evil.test/a.png")).toBeNull();
    expect(safeAvatarUrl("javascript:alert(1)")).toBeNull();
    expect(safeAvatarUrl("data:image/png;base64,AAAA")).toBeNull();
  });
});
