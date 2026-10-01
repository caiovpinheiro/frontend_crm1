import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { ChatArea } from "../chat-area";
import { makeMessage, renderStatic } from "./chat-test-utils";

const contact = { name: "Maria Silva", contactId: "c1" };
const messages = [makeMessage({ id: "m1", content: "Oi" })];

describe("ChatArea — SessionAlert × provider do canal", () => {
  it("Cloud API (ou provider desconhecido) mostra o alerta de 24h", () => {
    const html = renderStatic(
      <ChatArea contact={contact} messages={messages} conversationId="c" showSessionAlert />,
    );
    expect(html).toContain("Sessão de 24h encerrada");
    expect(
      renderStatic(
        <ChatArea
          contact={contact}
          messages={messages}
          conversationId="c"
          showSessionAlert
          channelProvider="META_CLOUD_API"
        />,
      ),
    ).toContain("Sessão de 24h encerrada");
  });

  it("canal Baileys não mostra o alerta nem o CTA de template", () => {
    const html = renderStatic(
      <ChatArea
        contact={contact}
        messages={messages}
        conversationId="c"
        showSessionAlert
        channelProvider="BAILEYS_MD"
      />,
    );
    expect(html).not.toContain("Sessão de 24h encerrada");
    expect(html).not.toContain("Usar Template");
  });
});
