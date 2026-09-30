import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isBaileysChannelProvider,
  isWhatsappComposerSessionExpired,
} from "@/features/inbox-v2/adapters";
import { channelUsesWhatsapp24hWindow } from "@/features/inbox-v2/hooks/use-channels";

describe("janela de 24h × canal Baileys", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  /** Tudo dizendo "expirada": só o provider pode liberar. */
  const expiredArgs = {
    applyWhatsappSession: true,
    messagesLoaded: true,
    channelOverrideActive: false,
    selectedSessionFetched: true,
    selectedSessionActive: false,
    messagesSessionActive: false,
    messagesLastInboundAt: "2026-09-25T12:00:00.000Z",
    threadLastInboundAt: "2026-09-25T12:00:00.000Z",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reconhece o provider Baileys em qualquer grafia e ignora os demais", () => {
    expect(isBaileysChannelProvider("BAILEYS_MD")).toBe(true);
    expect(isBaileysChannelProvider("baileys")).toBe(true);
    expect(isBaileysChannelProvider("META_CLOUD_API")).toBe(false);
    expect(isBaileysChannelProvider("WHATSAPP_META")).toBe(false);
    expect(isBaileysChannelProvider(null)).toBe(false);
    expect(isBaileysChannelProvider(undefined)).toBe(false);
  });

  it("sem provider (hosts antigos) mantém o comportamento: sessão expirada", () => {
    expect(isWhatsappComposerSessionExpired(expiredArgs)).toBe(true);
  });

  it("canal da conversa Baileys: nunca expira", () => {
    expect(
      isWhatsappComposerSessionExpired({ ...expiredArgs, channelProvider: "BAILEYS_MD" }),
    ).toBe(false);
  });

  it("Cloud API continua expirando mesmo com provider informado", () => {
    expect(
      isWhatsappComposerSessionExpired({ ...expiredArgs, channelProvider: "META_CLOUD_API" }),
    ).toBe(true);
  });

  it("override para canal Baileys libera; override para Cloud API a partir de Baileys mantém a regra", () => {
    expect(
      isWhatsappComposerSessionExpired({
        ...expiredArgs,
        channelOverrideActive: true,
        channelProvider: "META_CLOUD_API",
        selectedChannelProvider: "BAILEYS_MD",
      }),
    ).toBe(false);
    expect(
      isWhatsappComposerSessionExpired({
        ...expiredArgs,
        channelOverrideActive: true,
        channelProvider: "BAILEYS_MD",
        selectedChannelProvider: "META_CLOUD_API",
      }),
    ).toBe(true);
  });

  it("override sem provider do destino é conservador (aplica a regra normal)", () => {
    expect(
      isWhatsappComposerSessionExpired({
        ...expiredArgs,
        channelOverrideActive: true,
        channelProvider: "BAILEYS_MD",
      }),
    ).toBe(true);
  });

  it("channelUsesWhatsapp24hWindow: WhatsApp Cloud sim, Baileys/Instagram não", () => {
    expect(channelUsesWhatsapp24hWindow({ type: "WHATSAPP", provider: "META_CLOUD_API" })).toBe(true);
    expect(channelUsesWhatsapp24hWindow({ type: "WHATSAPP", provider: null })).toBe(true);
    expect(channelUsesWhatsapp24hWindow({ type: "WHATSAPP", provider: "BAILEYS_MD" })).toBe(false);
    expect(channelUsesWhatsapp24hWindow({ type: "INSTAGRAM", provider: null })).toBe(false);
    expect(channelUsesWhatsapp24hWindow(null)).toBe(false);
  });
});
