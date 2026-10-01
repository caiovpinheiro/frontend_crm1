import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { classifyTimelineItem } from "../chat-timeline";
import { toMessageBubble } from "@/features/inbox-v2/adapters";
import { approveAiDraft } from "@/features/inbox-v2/api/messages";
import { ChatArea } from "../chat-area";
import { makeMessage, renderStatic } from "./chat-test-utils";

describe("rascunho de agente IA (b3-ii)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("classify/adapter: ai_draft vira kind=draft (sem bolha comum)", () => {
    expect(classifyTimelineItem({ messageType: "ai_draft", isPrivate: true, content: "Olá" })).toEqual({ kind: "draft" });
    expect(classifyTimelineItem({ messageType: "AI_DRAFT", content: "Olá" }).kind).toBe("draft");
    const bubble = toMessageBubble(
      {
        id: "d1",
        conversationId: "c",
        direction: "out",
        messageType: "ai_draft",
        isPrivate: true,
        content: "Posso ajudar com o boleto?",
        createdAt: "2026-09-29T12:00:00.000Z",
        senderName: "Agente Cobrança",
      },
      "Maria",
    );
    expect(bubble.kind).toBe("draft");
    expect(bubble.isNote).toBeUndefined();
    expect(bubble.content).toBe("Posso ajudar com o boleto?");
  });

  it("ChatArea renderiza o card com aprovar/editar/descartar no lugar da bolha", () => {
    const html = renderStatic(
      <ChatArea
        contact={{ name: "Maria" }}
        messages={[
          makeMessage({ id: "m1", content: "Preciso do boleto" }),
          makeMessage({ id: "d1", type: "outgoing", kind: "draft", content: "Segue o boleto atualizado.", senderName: "Agente Cobrança", time: "10:05" }),
        ]}
        conversationId="conv-1"
      />,
    );
    expect(html).toContain('data-ai-draft-card="d1"');
    expect(html).toContain("Rascunho do agente IA");
    expect(html).toContain("Agente Cobrança");
    expect(html).toContain("Segue o boleto atualizado.");
    expect(html).toContain("Aprovar e enviar");
    expect(html).toContain("Descartar");
    expect(html).toContain(">Editar<");
    // O rascunho não vira bolha com menu de ações; a mensagem recebida sim.
    expect(html.split('aria-label="Reagir à mensagem"').length - 1).toBe(1);
  });

  it("approveAiDraft manda o texto editado só quando informado", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }),
    );
    await approveAiDraft("d1");
    expect(calls[0].url).toContain("/api/ai-agents/drafts/d1/approve");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({});
    await approveAiDraft("d1", "  texto editado ");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ content: "texto editado" });
  });
});
