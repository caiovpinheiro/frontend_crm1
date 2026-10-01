// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Binding reduzido do Kanban (a4): garante a conversa do contato
 * (auto-ensure travado pelo detail do negócio), expõe a nota fixada e a
 * conexão atual. O chat em si é o ConversationChatHost.
 */

const h = vi.hoisted(() => ({
  useDealDetail: vi.fn(),
  useMessages: vi.fn(),
  fetch: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/features/pipeline-v2/hooks/use-deal-detail", () => ({
  useDealDetail: h.useDealDetail,
  dealDetailKey: (id: string | null) => ["deal-detail-v2", id ?? "__none__"],
}));

vi.mock("@/features/inbox-v2/hooks", () => ({
  useMessages: h.useMessages,
}));

vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => `http://api.test${path}`,
}));

vi.mock("sonner", () => ({
  toast: { error: h.toastError, success: vi.fn() },
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import {
  DealChatBindingHost,
  DealChatEmptyState,
  type DealChatBindingResult,
} from "../deal-chat-binding";

type Params = { conversationId: string | null; contactId?: string | null; dealId?: string | null };

const detailPending = { data: undefined, isSuccess: false, isError: false };
const detailFor = (contactId: string, conversations: { id: string }[] = []) => ({
  data: { id: "deal-1", contact: { id: contactId, conversations } },
  isSuccess: true,
  isError: false,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

function renderBinding(params: Params) {
  const qc = new QueryClient();
  const results: DealChatBindingResult[] = [];
  const ui = (p: Params) => (
    <QueryClientProvider client={qc}>
      <DealChatBindingHost {...p}>
        {(r) => {
          results.push(r);
          return (
            <span
              data-testid="out"
              data-id={r.effectiveConversationId ?? ""}
              data-ensuring={String(r.ensuring)}
            />
          );
        }}
      </DealChatBindingHost>
    </QueryClientProvider>
  );
  const utils = render(ui(params));
  return {
    last: () => results[results.length - 1],
    rerenderWith: (p: Params) => utils.rerender(ui(p)),
  };
}

// O estado da mutation (isPending/isError) chega pelo notifyManager do
// TanStack (macrotask) — esperar só microtasks não basta.
const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", h.fetch);
  h.useMessages.mockReturnValue({ data: undefined });
  h.useDealDetail.mockReturnValue(detailPending);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useDealChatBinding — conversa efetiva", () => {
  it("com conversa do deal não garante nada: id efetivo é o do deal", () => {
    h.useDealDetail.mockReturnValue(detailFor("contact-1", [{ id: "conv-1" }]));
    const { last } = renderBinding({ conversationId: "conv-1", contactId: "contact-1", dealId: "deal-1" });
    expect(last().effectiveConversationId).toBe("conv-1");
    expect(last().ensuring).toBe(false);
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("trava: sem conversa, espera o detail do negócio antes de criar ticket", async () => {
    const { last, rerenderWith } = renderBinding({
      conversationId: null,
      contactId: "contact-1",
      dealId: "deal-1",
    });
    // Detail ainda carregando → skeleton, nenhum POST (o card pode ter ticket).
    expect(last().ensuring).toBe(true);
    expect(last().effectiveConversationId).toBeNull();
    expect(h.fetch).not.toHaveBeenCalled();

    // Detail confirma zero conversas → POST /api/conversations/create.
    const req = deferred<Response>();
    h.fetch.mockReturnValueOnce(req.promise);
    h.useDealDetail.mockReturnValue(detailFor("contact-1", []));
    rerenderWith({ conversationId: null, contactId: "contact-1", dealId: "deal-1" });
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = h.fetch.mock.calls[0];
    expect(url).toBe("http://api.test/api/conversations/create");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      contactId: "contact-1",
      skipSend: true,
      source: "deal_chat",
    });
    expect(last().ensuring).toBe(true);

    await act(async () => {
      req.resolve(jsonResponse({ conversation: { id: "conv-new" } }));
    });
    expect(last().effectiveConversationId).toBe("conv-new");
    expect(last().ensuring).toBe(false);
    expect(screen.getByTestId("out").getAttribute("data-id")).toBe("conv-new");
  });

  it("detail com ticket (prop ainda nula) não cria conversa nem fica garantindo", async () => {
    h.useDealDetail.mockReturnValue(detailFor("contact-1", [{ id: "conv-9" }]));
    const { last } = renderBinding({ conversationId: null, contactId: "contact-1", dealId: "deal-1" });
    await flush();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(last().ensuring).toBe(false);
    expect(last().effectiveConversationId).toBeNull();
  });

  it("detail de outro contato (seed do board atrasado) também trava", async () => {
    h.useDealDetail.mockReturnValue(detailFor("contact-other", []));
    const { last } = renderBinding({ conversationId: null, contactId: "contact-1", dealId: "deal-1" });
    await flush();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(last().ensuring).toBe(false);
  });

  it("sem contato não há o que garantir", async () => {
    const { last } = renderBinding({ conversationId: null, contactId: null, dealId: "deal-1" });
    await flush();
    expect(h.fetch).not.toHaveBeenCalled();
    expect(last().ensuring).toBe(false);
    expect(last().effectiveConversationId).toBeNull();
  });

  it("falha no POST avisa e libera o estado vazio", async () => {
    h.fetch.mockResolvedValueOnce(jsonResponse({ message: "Contato sem telefone" }, false));
    h.useDealDetail.mockReturnValue(detailFor("contact-1", []));
    const { last } = renderBinding({ conversationId: null, contactId: "contact-1", dealId: "deal-1" });
    await flush();
    await flush();
    expect(h.toastError).toHaveBeenCalledWith("Contato sem telefone");
    expect(last().ensuring).toBe(false);
    expect(last().effectiveConversationId).toBeNull();
  });

  it("resposta atrasada do card anterior não vincula ao card atual; o novo é garantido", async () => {
    const reqA = deferred<Response>();
    const reqB = deferred<Response>();
    h.fetch.mockReturnValueOnce(reqA.promise).mockReturnValueOnce(reqB.promise);

    h.useDealDetail.mockReturnValue(detailFor("contact-A", []));
    const { last, rerenderWith } = renderBinding({
      conversationId: null,
      contactId: "contact-A",
      dealId: "deal-A",
    });
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(1);

    // Operador troca de card enquanto o POST de A está em voo.
    h.useDealDetail.mockReturnValue(detailFor("contact-B", []));
    rerenderWith({ conversationId: null, contactId: "contact-B", dealId: "deal-B" });
    await flush();

    // A responde depois: ignorada (alvo agora é B).
    await act(async () => {
      reqA.resolve(jsonResponse({ conversation: { id: "conv-A" } }));
    });
    expect(last().effectiveConversationId).toBeNull();

    // Com o POST de A assentado, o de B dispara e vincula.
    await flush();
    expect(h.fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(h.fetch.mock.calls[1][1].body).contactId).toBe("contact-B");
    await act(async () => {
      reqB.resolve(jsonResponse({ conversation: { id: "conv-B" } }));
    });
    expect(last().effectiveConversationId).toBe("conv-B");
    expect(last().ensuring).toBe(false);
  });
});

describe("useDealChatBinding — nota fixada e conexão", () => {
  it("resolve a nota fixada da thread e a conexão atual", () => {
    h.useDealDetail.mockReturnValue(detailFor("contact-1", [{ id: "conv-1" }]));
    h.useMessages.mockReturnValue({
      data: {
        pinnedNoteId: "n1",
        channel: { id: "ch-1", name: "WABA", type: "WHATSAPP" },
        messages: [
          { id: "m1", content: "Oi", direction: "in" },
          { id: "n1", content: "Ligar amanhã", senderName: "Agente", createdAt: "2026-09-29T13:05:00.000Z" },
        ],
      },
    });
    const { last } = renderBinding({ conversationId: "conv-1", contactId: "contact-1", dealId: "deal-1" });
    expect(h.useMessages).toHaveBeenCalledWith("conv-1");
    expect(last().pinnedNote).toMatchObject({ id: "n1", content: "Ligar amanhã", senderName: "Agente" });
    expect(typeof last().pinnedNote?.time).toBe("string");
    expect(last().connection).toEqual({ id: "ch-1", name: "WABA", type: "WHATSAPP" });
  });

  it("sem nota fixada (ou nota fora da página carregada) devolve null", () => {
    h.useDealDetail.mockReturnValue(detailFor("contact-1", [{ id: "conv-1" }]));
    h.useMessages.mockReturnValue({
      data: { pinnedNoteId: "n-old", channel: null, messages: [{ id: "m1", content: "Oi" }] },
    });
    const { last } = renderBinding({ conversationId: "conv-1", contactId: "contact-1", dealId: "deal-1" });
    expect(last().pinnedNote).toBeNull();
    expect(last().connection).toBeNull();
  });
});

describe("DealChatEmptyState", () => {
  it("aponta para a Inbox", () => {
    render(<DealChatEmptyState />);
    expect(screen.getByText("Sem conversa vinculada")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/inbox");
  });
});
