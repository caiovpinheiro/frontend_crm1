import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isSessionExpired,
  isWhatsappComposerSessionExpired,
  lastInboundAtFromThread,
} from "@/features/inbox-v2/adapters";

describe("WhatsApp 24h composer session", () => {
  const now = new Date("2026-08-28T14:45:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reabre a janela quando o cliente acaba de responder (mesmo após template)", () => {
    const inboundAt = "2026-08-28T14:44:00.000Z";
    const threadLastInboundAt = lastInboundAtFromThread(
      [
        {
          direction: "out",
          createdAt: inboundAt,
          messageType: "template",
          channelId: "academico",
        },
        {
          direction: "in",
          createdAt: inboundAt,
          messageType: "text",
          channelId: "academico",
        },
      ],
      "academico",
    );

    expect(threadLastInboundAt).toBe(inboundAt);
    expect(isSessionExpired(threadLastInboundAt)).toBe(false);
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: true,
        messagesLoaded: true,
        channelOverrideActive: false,
        selectedSessionFetched: true,
        selectedSessionActive: false,
        messagesSessionActive: false,
        messagesLastInboundAt: null,
        threadLastInboundAt,
      }),
    ).toBe(false);
  });

  it("permanece encerrada em ticket só-template, sem inbound", () => {
    const threadLastInboundAt = lastInboundAtFromThread(
      [
        {
          direction: "out",
          createdAt: "2026-08-28T14:44:00.000Z",
          messageType: "template",
          channelId: "academico",
        },
      ],
      "academico",
    );

    expect(threadLastInboundAt).toBeNull();
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: true,
        messagesLoaded: true,
        channelOverrideActive: false,
        selectedSessionFetched: true,
        selectedSessionActive: false,
        messagesSessionActive: false,
        messagesLastInboundAt: null,
        threadLastInboundAt,
      }),
    ).toBe(true);
  });

  it("não reabre o canal override com inbound de outro número", () => {
    const inboundAt = "2026-08-28T14:44:00.000Z";
    const threadLastInboundAt = lastInboundAtFromThread(
      [
        {
          direction: "in",
          createdAt: inboundAt,
          messageType: "text",
          channelId: "academico",
        },
      ],
      "csv",
      { strictChannel: true },
    );

    expect(threadLastInboundAt).toBeNull();
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: true,
        messagesLoaded: true,
        channelOverrideActive: true,
        selectedSessionFetched: true,
        selectedSessionActive: false,
        messagesSessionActive: true,
        threadLastInboundAt,
      }),
    ).toBe(true);
  });

  it("permanece encerrada quando o último inbound tem mais de 24h", () => {
    expect(isSessionExpired("2026-08-27T14:44:59.000Z")).toBe(true);
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: true,
        messagesLoaded: true,
        channelOverrideActive: false,
        selectedSessionFetched: true,
        selectedSessionActive: false,
        threadLastInboundAt: "2026-08-27T14:44:59.000Z",
      }),
    ).toBe(true);
  });
});
