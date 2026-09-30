import { describe, expect, it } from "vitest";

import { MessageBubble } from "../message-bubble";
import { makeMessage, renderStatic } from "./chat-test-utils";

const TRIGGER = 'aria-label="Reagir à mensagem"';

describe("menu de ações em qualquer bolha não-nota", () => {
  it("recebida e enviada têm o gatilho; enviada posiciona à esquerda", () => {
    const received = renderStatic(<MessageBubble message={makeMessage({ id: "r" })} />);
    expect(received).toContain(TRIGGER);
    expect(received).toContain('data-message-actions-side="right"');

    const sent = renderStatic(
      <MessageBubble message={makeMessage({ id: "s", type: "outgoing", status: "read", senderName: "Ana" })} />,
    );
    expect(sent).toContain(TRIGGER);
    expect(sent).toContain('data-message-actions-side="left"');

    // Bolha de automação enviada também aceita citar/reagir.
    const bot = renderStatic(
      <MessageBubble message={makeMessage({ id: "b", type: "outgoing", isBot: true, senderName: "Boas-vindas" })} />,
    );
    expect(bot).toContain(TRIGGER);
  });

  it("nota, formulário e ligação continuam sem o menu", () => {
    expect(
      renderStatic(<MessageBubble message={makeMessage({ id: "n", type: "outgoing", kind: "note", isNote: true })} />),
    ).not.toContain(TRIGGER);
    expect(
      renderStatic(
        <MessageBubble message={makeMessage({ id: "f", formTitle: "form", formFields: [{ label: "Nome", value: "Ana" }] })} />,
      ),
    ).not.toContain(TRIGGER);
    expect(
      renderStatic(<MessageBubble message={makeMessage({ id: "c", messageType: "whatsapp_call", content: "Chamada" })} />),
    ).not.toContain(TRIGGER);
  });
});
