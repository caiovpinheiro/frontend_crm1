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

const api = vi.hoisted(() => ({ sendTemplate: vi.fn() }));
vi.mock("@/features/inbox-v2/api", () => api);

const hooks = vi.hoisted(() => ({
  applyOutboundPreviewToInboxCaches: vi.fn(),
  emitConversationReopened: vi.fn(),
  messagesKey: (id: string) => ["messages", id] as const,
}));
vi.mock("@/features/inbox-v2/hooks", () => hooks);

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

vi.mock("@/components/ui/confirm-dialog", () => ({
  useConfirm: () => ({ confirm: async () => true, dialog: null }),
}));
vi.mock("@/features/inbox-v2/extras/channel-pick-modal", () => ({
  ChannelPickModal: () => null,
}));
vi.mock("@/features/inbox-v2/extras/channel-selector", () => ({
  ChannelSelector: () => null,
}));

import {
  TemplateComposePanel,
  parseFlowActionData,
} from "@/features/inbox-v2/extras/template-compose-panel";

const TEMPLATE = {
  name: "boas_vindas",
  label: "Boas-vindas",
  content: "Olá {{1}}, tudo bem?",
  language: "pt_BR",
  metaTemplateId: "g-1",
};

function renderPanel() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onSent = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <TemplateComposePanel
        conversationId="conv-1"
        template={TEMPLATE}
        onCancel={vi.fn()}
        onSent={onSent}
      />
    </QueryClientProvider>,
  );
  return { onSent };
}

function fillVariable(value = "Ana") {
  fireEvent.change(screen.getByPlaceholderText("Valor para {{1}}"), {
    target: { value },
  });
}

function openFlow() {
  fireEvent.click(screen.getByRole("button", { name: /Flow \(opcional\)/ }));
}

function sendButton() {
  return screen.getByRole("button", { name: /Enviar template/ });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("parseFlowActionData", () => {
  it("vazio = sem dados", () => {
    expect(parseFlowActionData("")).toEqual({ ok: true, data: null });
    expect(parseFlowActionData("  \n")).toEqual({ ok: true, data: null });
  });

  it("aceita objeto e rejeita lista, primitivo e JSON quebrado", () => {
    expect(parseFlowActionData('{"screen":"HOME","data":{"a":1}}')).toEqual({
      ok: true,
      data: { screen: "HOME", data: { a: 1 } },
    });
    expect(parseFlowActionData("[1]")).toEqual({
      ok: false,
      error: "O JSON deve ser um objeto {...}, não lista ou primitivo.",
    });
    expect(parseFlowActionData("null").ok).toBe(false);
    expect(parseFlowActionData("42").ok).toBe(false);
    expect(parseFlowActionData("{oops")).toEqual({
      ok: false,
      error: "JSON inválido. Corrija ou deixe em branco.",
    });
  });
});

describe("TemplateComposePanel — Flow", () => {
  it("campos de Flow ficam recolhidos e sem eles o envio vai sem token/dados", async () => {
    api.sendTemplate.mockResolvedValue({ message: { id: "m1" } });
    const { onSent } = renderPanel();

    expect(screen.queryByLabelText("Token do Flow (opcional)")).toBeNull();
    fillVariable();
    fireEvent.click(sendButton());

    await waitFor(() => expect(api.sendTemplate).toHaveBeenCalledTimes(1));
    const [conversationId, vars] = api.sendTemplate.mock.calls[0];
    expect(conversationId).toBe("conv-1");
    expect(vars).toMatchObject({
      templateName: "boas_vindas",
      languageCode: "pt_BR",
      templateGraphId: "g-1",
      components: [
        { type: "body", parameters: [{ type: "text", text: "Ana" }] },
      ],
      flowToken: null,
      flowActionData: null,
    });
    await waitFor(() => expect(onSent).toHaveBeenCalled());
  });

  it("token e JSON inicial do Flow entram no payload", async () => {
    api.sendTemplate.mockResolvedValue({ message: { id: "m2" } });
    renderPanel();
    fillVariable();
    openFlow();

    fireEvent.change(screen.getByLabelText("Token do Flow (opcional)"), {
      target: { value: "  tok-123  " },
    });
    fireEvent.change(screen.getByLabelText("JSON inicial do Flow"), {
      target: { value: '{"screen":"HOME","data":{"campo":"valor"}}' },
    });
    fireEvent.click(sendButton());

    await waitFor(() => expect(api.sendTemplate).toHaveBeenCalledTimes(1));
    expect(api.sendTemplate.mock.calls[0][1]).toMatchObject({
      flowToken: "tok-123",
      flowActionData: { screen: "HOME", data: { campo: "valor" } },
    });
  });

  it("JSON inválido bloqueia o envio e mostra o erro inline", async () => {
    renderPanel();
    fillVariable();
    openFlow();
    fireEvent.change(screen.getByLabelText("JSON inicial do Flow"), {
      target: { value: "{oops" },
    });
    fireEvent.click(sendButton());

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "JSON inválido. Corrija ou deixe em branco.",
    );
    expect(api.sendTemplate).not.toHaveBeenCalled();

    // Corrigir limpa o erro.
    fireEvent.change(screen.getByLabelText("JSON inicial do Flow"), {
      target: { value: "{}" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("JSON inválido com a seção recolhida reabre a seção com o erro", async () => {
    renderPanel();
    fillVariable();
    openFlow();
    fireEvent.change(screen.getByLabelText("JSON inicial do Flow"), {
      target: { value: "[1]" },
    });
    openFlow(); // recolhe
    expect(screen.queryByLabelText("JSON inicial do Flow")).toBeNull();

    fireEvent.click(sendButton());
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "O JSON deve ser um objeto {...}, não lista ou primitivo.",
    );
    expect(screen.getByLabelText("JSON inicial do Flow")).toBeTruthy();
    expect(api.sendTemplate).not.toHaveBeenCalled();
  });
});
