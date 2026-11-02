/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ActiveWebchatNotice } from "@/features/inbox-v2/extras/active-webchat-notice";

const fetchMock = vi.fn();

function reply(active: unknown, ok = true) {
  fetchMock.mockResolvedValue({ ok, json: async () => ({ active }) });
}

function renderNotice(props: Partial<Parameters<typeof ActiveWebchatNotice>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ActiveWebchatNotice conversationId="conv-1" {...props} />
    </QueryClientProvider>,
  );
}

const ACTIVE = { id: "cuid-web", number: 34111, reason: "online" };

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("aviso de contato no chat", () => {
  it("mostra o número e o link para a conversa do chat", async () => {
    reply(ACTIVE);
    renderNotice();
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("Este contato está no chat agora (Nº 34111)");
    expect(screen.getByRole("link", { name: "Abrir conversa" }).getAttribute("href")).toBe(
      "/inbox?c=34111",
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("/api/conversations/conv-1/active-webchat");
  });

  it("contato sem chat ativo não muda nada na tela", async () => {
    reply(null);
    const { container } = renderNotice();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("erro da API não mostra aviso", async () => {
    reply(ACTIVE, false);
    const { container } = renderNotice();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("conversa de webchat ou sem conversa não consulta", () => {
    reply(ACTIVE);
    renderNotice({ enabled: false });
    renderNotice({ conversationId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no inbox o clique troca a conversa pelo id, sem navegar", async () => {
    reply(ACTIVE);
    const onOpen = vi.fn();
    renderNotice({ onOpen });
    const link = await screen.findByRole("link", { name: "Abrir conversa" });
    const notPrevented = fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledWith("cuid-web");
    expect(notPrevented).toBe(false);
  });

  it("Ctrl/Cmd mantém abrir em outra aba", async () => {
    reply(ACTIVE);
    const onOpen = vi.fn();
    renderNotice({ onOpen });
    fireEvent.click(await screen.findByRole("link", { name: "Abrir conversa" }), { ctrlKey: true });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
