import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { ChatArea } from "../chat-area";
import { countOf, makeMessage, renderStatic } from "./chat-test-utils";

const contact = { name: "Maria Silva", contactId: "c1", phone: "5511999999999" };

const note = makeMessage({
  id: "n1",
  content: "Ligar amanhã às 10h",
  type: "outgoing",
  kind: "note",
  isNote: true,
  senderName: "Ana",
});
const incoming = makeMessage({ id: "m1", content: "Bom dia" });

describe("ChatArea — ações de nota interna (a2)", () => {
  it("repassa fixar/editar/excluir/log só às bolhas de nota e mostra o banner da nota fixada", () => {
    const html = renderStatic(
      <ChatArea
        contact={contact}
        messages={[incoming, note]}
        conversationId="conv-1"
        pinnedNote={{ id: "n1", content: "Ligar amanhã às 10h", senderName: "Ana" }}
        onPinNote={() => {}}
        onEditNote={() => {}}
        onDeleteNote={() => {}}
        onAddToLog={() => {}}
      />,
    );

    // Banner "Nota fixada" com o texto e o botão de desafixar.
    expect(html).toContain("Nota fixada");
    expect(html).toContain('aria-label="Ir para a nota fixada"');
    expect(html).toContain('aria-label="Desafixar nota"');
    expect(countOf(html, "Ligar amanhã às 10h")).toBeGreaterThanOrEqual(2);

    // NoteRow da nota fixada: pill "fixada" + ações. Uma ocorrência de cada
    // (a mensagem recebida não ganha ações de nota).
    expect(html).toContain(">fixada<");
    expect(countOf(html, 'aria-label="Editar nota"')).toBe(1);
    expect(countOf(html, 'aria-label="Excluir nota"')).toBe(1);
    expect(countOf(html, 'aria-label="Adicionar ao log do negócio"')).toBe(1);
  });

  it("sem as props novas nada muda: sem banner e sem ações de nota", () => {
    const html = renderStatic(
      <ChatArea contact={contact} messages={[incoming, note]} conversationId="conv-1" />,
    );
    expect(html).not.toContain("Nota fixada");
    expect(html).not.toContain('aria-label="Editar nota"');
    expect(html).not.toContain('aria-label="Excluir nota"');
    expect(html).not.toContain('aria-label="Adicionar ao log do negócio"');
    expect(html).not.toContain(">fixada<");
    // A nota em si continua renderizada.
    expect(html).toContain("Ligar amanhã às 10h");
  });

  it("banner sem onPinNote não oferece o X de desafixar", () => {
    const html = renderStatic(
      <ChatArea
        contact={contact}
        messages={[note]}
        conversationId="conv-1"
        pinnedNote={{ id: "n1", content: "Ligar amanhã às 10h" }}
      />,
    );
    expect(html).toContain("Nota fixada");
    expect(html).not.toContain('aria-label="Desafixar nota"');
  });
});
