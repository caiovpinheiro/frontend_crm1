import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { ChatArea } from "../chat-area";
import { makeMessage, renderStatic } from "./chat-test-utils";

const contact = { name: "Maria Silva", contactId: "c1" };
const messages = [makeMessage({ id: "m1", content: "Oi" })];

describe("ChatArea — 'digitando…' no cabeçalho", () => {
  it("com `typingHint` mostra o texto no header, anunciado por aria-live", () => {
    const html = renderStatic(
      <ChatArea
        contact={contact}
        messages={messages}
        conversationId="c"
        typingHint="Ana está digitando…"
      />,
    );
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toContain("Ana está digitando…");
    expect(header).toContain('aria-live="polite"');
    expect(header).toContain('data-testid="chat-typing-hint"');
  });

  it("sem `typingHint` (ou vazio) não renderiza nada", () => {
    for (const typingHint of [undefined, null, ""]) {
      const html = renderStatic(
        <ChatArea
          contact={contact}
          messages={messages}
          conversationId="c"
          typingHint={typingHint}
        />,
      );
      expect(html).not.toContain("chat-typing-hint");
      expect(html).not.toContain("digitando");
    }
  });
});
