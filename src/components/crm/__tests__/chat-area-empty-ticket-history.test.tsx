// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { TooltipProvider } from "@/components/crm/tooltip-glass";
import { ChatArea } from "../chat-area";
import { makeMessage } from "./chat-test-utils";

/**
 * Negócio cujo ticket aberto está VAZIO (ex.: ticket criado ao abrir o card
 * e encerrado sem mensagens) mas o contato tem mensagens em tickets
 * anteriores (`hasOlderTickets`). Antes: o prefetch de histórico só rodava
 * com `messages.length > 0` e o gesto de scroll ficava travado — a tela
 * parava em "Nenhuma mensagem nesta conversa." sem caminho para o histórico.
 */

const EMPTY_TEXT = "Nenhuma mensagem nesta conversa.";
const contact = { name: "Gabriela Lipari", contactId: "c1" };

type Props = Partial<ComponentProps<typeof ChatArea>>;

function tree(props: Props) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, enabled: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ChatArea contact={contact} messages={[]} conversationId="conv-vazia" {...props} />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/** Deixa o `requestAnimationFrame` do pin/prefetch rodar. */
async function flushFrames() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });
}

beforeEach(() => {
  // jsdom não tem IntersectionObserver (pill de dia fixa do ChatArea).
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatArea — ticket atual vazio com tickets anteriores", () => {
  it("carrega sozinho a fatia anterior e não mostra o estado vazio", async () => {
    const onLoadOlder = vi.fn();
    render(tree({ hasOlder: true, hasOlderTickets: true, onLoadOlder }));
    await flushFrames();

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("dispara uma vez só por conversa, mesmo com re-render da lista vazia", async () => {
    const onLoadOlder = vi.fn();
    const view = render(tree({ hasOlder: true, hasOlderTickets: true, onLoadOlder }));
    await flushFrames();
    view.rerender(tree({ hasOlder: true, hasOlderTickets: true, onLoadOlder, messages: [] }));
    await flushFrames();
    view.rerender(
      tree({ hasOlder: true, hasOlderTickets: true, onLoadOlder, messages: [], isLoadingOlder: true }),
    );
    await flushFrames();

    expect(onLoadOlder).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
  });

  it("se a carga falhar (segue vazio com histórico pendente) oferece carregar de novo", async () => {
    const onLoadOlder = vi.fn();
    render(tree({ hasOlder: true, hasOlderTickets: true, onLoadOlder }));
    await flushFrames();

    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Carregar mensagens anteriores" }));
    expect(onLoadOlder).toHaveBeenCalledTimes(2);
  });

  it("histórico chegou: mostra as mensagens do ticket anterior", async () => {
    const onLoadOlder = vi.fn();
    const view = render(tree({ hasOlder: true, hasOlderTickets: true, onLoadOlder }));
    await flushFrames();
    view.rerender(
      tree({
        hasOlder: false,
        hasOlderTickets: false,
        onLoadOlder,
        messages: [makeMessage({ id: "m-antiga", content: "Mas eu não consigo de forma online" })],
      }),
    );
    await flushFrames();

    expect(screen.getByText("Mas eu não consigo de forma online")).toBeTruthy();
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(onLoadOlder).toHaveBeenCalledTimes(1);
  });

  it("sem tickets anteriores continua mostrando o estado vazio, sem GET extra", async () => {
    const onLoadOlder = vi.fn();
    render(tree({ hasOlder: false, hasOlderTickets: false, onLoadOlder }));
    await flushFrames();

    expect(screen.getByText(EMPTY_TEXT)).toBeTruthy();
    expect(onLoadOlder).not.toHaveBeenCalled();
  });

  it("ticket atual com mensagens que enchem a tela não busca histórico ao abrir", async () => {
    // jsdom não mede layout (alturas 0): `clientHeight` 0 conta como tela cheia.
    const onLoadOlder = vi.fn();
    render(
      tree({
        hasOlder: true,
        hasOlderTickets: true,
        onLoadOlder,
        messages: [makeMessage({ id: "m1", content: "Oi, tudo bem?" })],
      }),
    );
    await flushFrames();

    expect(screen.getByText("Oi, tudo bem?")).toBeTruthy();
    expect(onLoadOlder).not.toHaveBeenCalled();
  });
});
