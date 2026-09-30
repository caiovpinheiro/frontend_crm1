/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  listScheduledMessages: vi.fn(),
  cancelScheduledMessage: vi.fn(),
  createScheduledMessage: vi.fn(),
  uploadAutomationMedia: vi.fn(),
}));
vi.mock("@/features/inbox-v2/api", () => api);

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/hooks/use-document-visible", () => ({
  useDocumentVisible: () => true,
}));

import {
  ScheduledMessagesBanner,
  formatScheduledAt,
  scheduledMessageSummary,
} from "@/features/inbox-v2/extras/scheduled-messages-banner";

const ITEMS = [
  { id: "s1", content: "Bom dia!", scheduledAt: "2099-01-01T13:05:00.000Z" },
  {
    id: "s2",
    content: "",
    scheduledAt: "2099-01-02T13:05:00.000Z",
    fallbackTemplateName: "boas_vindas",
  },
  { id: "s3", content: "", scheduledAt: "2099-01-03T13:05:00.000Z" },
];

function renderBanner(conversationId: string | null = "conv-1") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <ScheduledMessagesBanner conversationId={conversationId} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("helpers", () => {
  it("resume texto > template > [anexo]", () => {
    expect(scheduledMessageSummary({ content: " x".repeat(60) })).toHaveLength(80);
    expect(
      scheduledMessageSummary({ content: "", fallbackTemplateName: "boas_vindas" }),
    ).toBe("Template: boas_vindas");
    expect(scheduledMessageSummary({ content: "  " })).toBe("[anexo]");
  });

  it("formata dd/MM HH:mm e devolve o cru quando inválido", () => {
    expect(formatScheduledAt("2099-01-01T13:05:00.000Z")).toMatch(
      /^\d{2}\/\d{2},? \d{2}:\d{2}$/,
    );
    expect(formatScheduledAt("nada")).toBe("nada");
  });
});

describe("ScheduledMessagesBanner", () => {
  it("mostra até 2 agendamentos e condensa o resto", async () => {
    api.listScheduledMessages.mockResolvedValue({ items: ITEMS });
    renderBanner();

    expect(await screen.findAllByText(/Agendada para/)).toHaveLength(2);
    expect(screen.getByText(/\+1 outro\(s\)/)).toBeTruthy();
    expect(screen.getByText(/Bom dia!/)).toBeTruthy();
    expect(screen.getByText(/Template: boas_vindas/)).toBeTruthy();
    expect(api.listScheduledMessages).toHaveBeenCalledWith("conv-1");
  });

  it("cancelar chama DELETE e recarrega a lista", async () => {
    api.listScheduledMessages
      .mockResolvedValueOnce({ items: ITEMS })
      .mockResolvedValue({ items: ITEMS.slice(1) });
    api.cancelScheduledMessage.mockResolvedValue(undefined);
    renderBanner();

    const [first] = await screen.findAllByRole("button", {
      name: /Cancelar agendamento de/,
    });
    fireEvent.click(first);

    await waitFor(() =>
      expect(api.cancelScheduledMessage).toHaveBeenCalledWith("s1"),
    );
    await waitFor(() => expect(screen.queryByText(/\+1 outro/)).toBeNull());
    expect(screen.queryByText(/Bom dia!/)).toBeNull();
    expect(toast.success).toHaveBeenCalledWith("Agendamento cancelado");
  });

  it("erro ao cancelar vira toast e mantém a lista", async () => {
    api.listScheduledMessages.mockResolvedValue({ items: ITEMS.slice(0, 1) });
    api.cancelScheduledMessage.mockRejectedValue(new Error("boom"));
    renderBanner();

    fireEvent.click(
      await screen.findByRole("button", { name: /Cancelar agendamento de/ }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Falha ao cancelar agendamento"),
    );
    expect(screen.getByText(/Bom dia!/)).toBeTruthy();
  });

  it("sem conversa aberta não busca nem renderiza", () => {
    const { container } = renderBanner(null);
    expect(container.innerHTML).toBe("");
    expect(api.listScheduledMessages).not.toHaveBeenCalled();
  });

  it("lista vazia não renderiza nada", async () => {
    api.listScheduledMessages.mockResolvedValue({ items: [] });
    const { container } = renderBanner();
    await waitFor(() => expect(api.listScheduledMessages).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
});
