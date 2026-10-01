import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { ChatArea } from "../chat-area";
import { MessageBubble, isDeliveryStale } from "../message-bubble";
import { resendMessage } from "@/features/inbox-v2/api/messages";
import { makeMessage, renderStatic } from "./chat-test-utils";

const NOW = new Date("2026-09-30T12:00:00.000Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

describe("status de entrega (b3-i)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("isDeliveryStale: só sent/pending com mais de 5 min", () => {
    expect(isDeliveryStale("sent", minutesAgo(6))).toBe(true);
    expect(isDeliveryStale("pending", minutesAgo(6))).toBe(true);
    expect(isDeliveryStale("sent", minutesAgo(4))).toBe(false);
    expect(isDeliveryStale("delivered", minutesAgo(60))).toBe(false);
    expect(isDeliveryStale("read", minutesAgo(60))).toBe(false);
    expect(isDeliveryStale("failed", minutesAgo(60))).toBe(false);
    expect(isDeliveryStale("sent", undefined)).toBe(false);
    expect(isDeliveryStale("sent", "data inválida")).toBe(false);
  });

  it("bolha enviada em `sent` há 10 min mostra o aviso; entregue ou recente não", () => {
    const stale = renderStatic(
      <MessageBubble message={makeMessage({ id: "a", type: "outgoing", status: "sent", createdAt: minutesAgo(10) })} />,
    );
    expect(stale).toContain('aria-label="Entrega não confirmada"');

    const fresh = renderStatic(
      <MessageBubble message={makeMessage({ id: "b", type: "outgoing", status: "sent", createdAt: minutesAgo(2) })} />,
    );
    expect(fresh).not.toContain('aria-label="Entrega não confirmada"');
    expect(fresh).toContain('aria-label="Enviada"');

    const delivered = renderStatic(
      <MessageBubble message={makeMessage({ id: "c", type: "outgoing", status: "delivered", createdAt: minutesAgo(30) })} />,
    );
    expect(delivered).not.toContain('aria-label="Entrega não confirmada"');
  });

  it("\"Reenviar\" só em enviada com falha e com handler", () => {
    const failed = makeMessage({ id: "f", type: "outgoing", status: "failed", content: "Oi", createdAt: minutesAgo(1) });
    expect(renderStatic(<MessageBubble message={failed} onResendMessage={() => {}} />)).toContain('aria-label="Reenviar mensagem"');
    expect(renderStatic(<MessageBubble message={failed} />)).not.toContain('aria-label="Reenviar mensagem"');
    expect(
      renderStatic(<MessageBubble message={{ ...failed, type: "incoming" }} onResendMessage={() => {}} />),
    ).not.toContain('aria-label="Reenviar mensagem"');
    expect(
      renderStatic(<MessageBubble message={{ ...failed, kind: "note", isNote: true }} onResendMessage={() => {}} />),
    ).not.toContain('aria-label="Reenviar mensagem"');
  });

  it("ChatArea com conversationId oferece o Reenviar sem o host passar handler", () => {
    const failed = makeMessage({ id: "f", type: "outgoing", status: "failed", content: "Oi", createdAt: minutesAgo(1) });
    expect(
      renderStatic(<ChatArea contact={{ name: "Maria" }} messages={[failed]} conversationId="conv-1" />),
    ).toContain('aria-label="Reenviar mensagem"');
    expect(
      renderStatic(<ChatArea contact={{ name: "Maria" }} messages={[failed]} />),
    ).not.toContain('aria-label="Reenviar mensagem"');
  });

  it("resendMessage: texto vai por POST /messages; mídia reaproveita o anexo", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ message: { id: "new" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    await resendMessage("conv-1", { content: "Olá de novo" });
    expect(calls[0].url).toContain("/api/conversations/conv-1/messages");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content: "Olá de novo" });

    await resendMessage("conv-1", { content: "[image]", mediaUrl: "/uploads/org/foto.jpg" });
    expect(calls[1].url).toContain("/api/conversations/conv-1/attachments");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ reuseUrl: "/uploads/org/foto.jpg" });

    await resendMessage("conv-1", { content: "legenda real", mediaUrl: "/uploads/org/foto.jpg" });
    expect(JSON.parse(String(calls[2].init?.body))).toEqual({ reuseUrl: "/uploads/org/foto.jpg", caption: "legenda real" });

    await expect(resendMessage("conv-1", { content: "   " })).rejects.toThrow(/sem conteúdo/);
  });
});
