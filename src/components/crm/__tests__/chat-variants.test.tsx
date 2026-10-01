import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { classifyTimelineItem, detectConsentVerdict, isHideableChatEvent } from "../chat-timeline";
import { extractTemplateMeta, toMessageBubble } from "@/features/inbox-v2/adapters";
import type { InboxMessageDto } from "@/features/inbox-v2/api";
import { ChatArea } from "../chat-area";
import { MessageBubble, templateBadgeInfo } from "../message-bubble";
import { makeMessage, renderStatic } from "./chat-test-utils";

function dto(over: Partial<InboxMessageDto> & { id: string }): InboxMessageDto {
  return {
    conversationId: "conv",
    direction: "in",
    content: "",
    createdAt: "2026-09-29T12:00:00.000Z",
    ...over,
  };
}

describe("classify — eventos Meta e consentimento (b3-v)", () => {
  it("direction=system (não separador) vira `system`; separador continua `message`", () => {
    expect(
      classifyTimelineItem({ direction: "system", messageType: "system", content: "USER A CHANGED FROM 5511 TO 5522" }).kind,
    ).toBe("system");
    expect(classifyTimelineItem({ direction: "in", messageType: "text", content: "[system]" }).kind).toBe("system");
    expect(classifyTimelineItem({ direction: "system", messageType: "ticket-separator", content: "{}" }).kind).toBe("message");
    // Evento por messageType vence, mesmo com direction=system.
    expect(classifyTimelineItem({ direction: "system", messageType: "event:tag", content: "Tag adicionada" }).kind).toBe("event");
  });

  it("consentimento: aceitou/recusou/permanente/genérico; texto OUT do agente não vira card", () => {
    expect(detectConsentVerdict("📞 Cliente aceitou o pedido de ligações (permanente)")).toBe("granted_perm");
    expect(detectConsentVerdict("Cliente aceitou o pedido de ligações")).toBe("granted_temp");
    expect(detectConsentVerdict("Cliente recusou o pedido de ligações")).toBe("denied");
    expect(detectConsentVerdict("📞 Resposta ao pedido de ligações")).toBe("unknown");
    expect(detectConsentVerdict("Bom dia, tudo bem?")).toBeNull();
    expect(detectConsentVerdict("cliente aceitou ".repeat(20))).toBeNull();

    const c = classifyTimelineItem({ direction: "in", messageType: "text", content: "Cliente recusou o pedido de ligações" });
    expect(c).toEqual({ kind: "consent", consentVerdict: "denied" });
    expect(
      classifyTimelineItem({ direction: "out", messageType: "text", content: "Cliente recusou a proposta" }).kind,
    ).toBe("message");
    // Nota privada nunca vira consentimento/sistema.
    expect(
      classifyTimelineItem({ direction: "out", messageType: "note", isPrivate: true, senderName: "Ana", content: "cliente aceitou" }).kind,
    ).toBe("note");
  });

  it("ocultar eventos esconde consentimento mas mantém o evento de sistema (troca de número)", () => {
    expect(isHideableChatEvent({ kind: "consent" })).toBe(true);
    expect(isHideableChatEvent({ kind: "system" })).toBe(false);
  });
});

describe("adapter — templateMeta e kinds novos", () => {
  it("extrai nome/categoria do cabeçalho 📋 e do formato Nome:/Categoria:", () => {
    expect(extractTemplateMeta("📋 *boas_vindas*\n_Marketing_\n\nOlá!")).toEqual({ name: "boas_vindas", category: "Marketing" });
    expect(extractTemplateMeta("📋 *aviso*\n\nCorpo")).toEqual({ name: "aviso", category: null });
    expect(extractTemplateMeta("📋 Modelo de mensagem enviado ao cliente pelo WhatsApp.\n\nNome: otp_login\nCategoria: Autenticação")).toEqual({ name: "otp_login", category: "Autenticação" });
    expect(extractTemplateMeta("texto comum")).toBeNull();
  });

  it("toMessageBubble preenche templateMeta só em template e mapeia system/consent", () => {
    const tpl = toMessageBubble(dto({ id: "t", direction: "out", messageType: "template", content: "📋 *promo*\n_Marketing_\n\nOferta" }), "Maria");
    expect(tpl.templateMeta).toEqual({ name: "promo", category: "Marketing" });
    expect(tpl.content).toBe("Oferta");
    expect(toMessageBubble(dto({ id: "x", messageType: "text", content: "📋 *promo*\n_Marketing_" }), "Maria").templateMeta).toBeUndefined();

    const sys = toMessageBubble(dto({ id: "s", direction: "system", messageType: "system", content: "USER A CHANGED FROM 5511982063029 TO 5511912345678" }), "Maria");
    expect(sys.kind).toBe("system");
    expect(sys.isNote).toBeUndefined();

    const consent = toMessageBubble(dto({ id: "c", direction: "in", messageType: "text", content: "Cliente aceitou o pedido de ligações (permanente)" }), "Maria");
    expect(consent.kind).toBe("consent");
    expect(consent.consentVerdict).toBe("granted_perm");
  });
});

describe("render — linhas de sistema/consentimento e badge de template", () => {
  const contact = { name: "Maria" };

  it("ChatArea renderiza troca de número com os dois telefones e a resposta de permissão", () => {
    const html = renderStatic(
      <ChatArea
        contact={contact}
        messages={[
          makeMessage({ id: "s1", kind: "system", type: "outgoing", content: "USER A CHANGED FROM 5511982063029 TO 5511912345678", time: "10:00" }),
          makeMessage({ id: "s2", kind: "system", type: "outgoing", content: "[system]", time: "10:01" }),
          makeMessage({ id: "c1", kind: "consent", consentVerdict: "denied", content: "Cliente recusou o pedido de ligações", time: "10:02" }),
        ]}
        conversationId="c"
      />,
    );
    expect(html).toContain('data-chat-system-event="number-change"');
    expect(html).toContain("Cliente trocou de número");
    expect(html).toContain("+55 (11) 98206-3029");
    expect(html).toContain("+55 (11) 91234-5678");
    expect(html).toContain('data-chat-system-event="generic"');
    expect(html).toContain("Evento do sistema WhatsApp");
    expect(html).toContain('data-chat-consent="denied"');
    expect(html).toContain("Permissão de ligação recusada");
    // Nada disso vira bolha com menu de ações.
    expect(html).not.toContain('aria-label="Reagir à mensagem"');
  });

  it("badge do template mostra a categoria e o nome no title", () => {
    expect(templateBadgeInfo({ name: "promo", category: "MARKETING" }).label).toBe("Marketing");
    expect(templateBadgeInfo({ name: null, category: "utility" }).label).toBe("Utility");
    expect(templateBadgeInfo({ name: null, category: "Autenticação" }).label).toBe("Autenticação");
    expect(templateBadgeInfo(null).label).toBe("Template");

    const html = renderStatic(
      <MessageBubble
        message={makeMessage({ id: "t1", type: "outgoing", messageType: "template", content: "Oferta", templateMeta: { name: "promo", category: "Marketing" } })}
      />,
    );
    expect(html).toContain('data-template-category="marketing"');
    expect(html).toContain(">Marketing</span>");
    expect(html).toContain("Marketing · promo");
  });
});
