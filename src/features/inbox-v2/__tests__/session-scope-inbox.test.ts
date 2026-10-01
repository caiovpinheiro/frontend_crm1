import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isBaileysChannelProvider,
  isWhatsappComposerSessionExpired,
} from "@/features/inbox-v2/adapters";
import { resolveWhatsappSessionScope } from "@/features/inbox-v2/hooks/use-channels";

/**
 * Wiring do host da Inbox (`app/(app)/inbox/_v2-client.tsx`): o escopo
 * derivado por `resolveWhatsappSessionScope` alimenta `useChannelSession`
 * (`opts.provider`), `isWhatsappComposerSessionExpired` (`channelProvider` /
 * `selectedChannelProvider`) e o `channelProvider` do ChatArea.
 */
describe("Inbox — escopo da janela de 24h por provider", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");
  const cloud = { id: "csv", type: "WHATSAPP", provider: "META_CLOUD_API" };
  const baileys = { id: "pessoal", type: "WHATSAPP", provider: "BAILEYS_MD" };
  const instagram = { id: "ig", type: "INSTAGRAM", provider: "META_INSTAGRAM_LOGIN" };
  /** Backend dizendo "sessão fechada" por todos os caminhos. */
  const closed = {
    messagesLoaded: true,
    selectedSessionFetched: true,
    selectedSessionActive: false,
    messagesSessionActive: false,
    messagesLastInboundAt: "2026-09-20T12:00:00.000Z",
    threadLastInboundAt: "2026-09-20T12:00:00.000Z",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Cloud API selecionado: aplica a regra e o composer bloqueia com sessão fechada", () => {
    const scope = resolveWhatsappSessionScope({
      selectedOutbound: cloud,
      conversationChannelType: "WHATSAPP",
      conversationChannelProvider: "META_CLOUD_API",
    });
    expect(scope).toEqual({
      applyWhatsappSession: true,
      channelProvider: "META_CLOUD_API",
      selectedChannelProvider: "META_CLOUD_API",
      effectiveProvider: "META_CLOUD_API",
    });
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: scope.applyWhatsappSession,
        channelOverrideActive: false,
        ...closed,
        channelProvider: scope.channelProvider,
        selectedChannelProvider: scope.selectedChannelProvider,
      }),
    ).toBe(true);
  });

  it("Baileys selecionado: não aplica, GET /session desligado e composer livre", () => {
    const scope = resolveWhatsappSessionScope({
      selectedOutbound: baileys,
      conversationChannelType: "WHATSAPP",
      conversationChannelProvider: "BAILEYS_MD",
    });
    expect(scope.applyWhatsappSession).toBe(false);
    expect(scope.effectiveProvider).toBe("BAILEYS_MD");
    // `useChannelSession(..., { provider })` fica `enabled: false` neste caso.
    expect(isBaileysChannelProvider(scope.selectedChannelProvider)).toBe(true);
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: scope.applyWhatsappSession,
        channelOverrideActive: false,
        ...closed,
        channelProvider: scope.channelProvider,
        selectedChannelProvider: scope.selectedChannelProvider,
      }),
    ).toBe(false);
  });

  it("sem canal selecionado (lista ainda não carregou) cai no canal da conversa + channelProvider", () => {
    const viaBaileys = resolveWhatsappSessionScope({
      selectedOutbound: undefined,
      conversationChannelType: "WHATSAPP",
      conversationChannelProvider: "BAILEYS_MD",
    });
    expect(viaBaileys.applyWhatsappSession).toBe(false);
    expect(viaBaileys.selectedChannelProvider).toBeNull();
    expect(viaBaileys.effectiveProvider).toBe("BAILEYS_MD");

    // Backend antigo sem provider: comportamento de hoje (aplica a todo WHATSAPP).
    const legacy = resolveWhatsappSessionScope({
      conversationChannelType: "WHATSAPP",
      conversationChannelProvider: null,
    });
    expect(legacy.applyWhatsappSession).toBe(true);
    expect(legacy.effectiveProvider).toBeNull();
  });

  it("Instagram não tem janela de 24h", () => {
    expect(
      resolveWhatsappSessionScope({ selectedOutbound: instagram, conversationChannelType: "INSTAGRAM" })
        .applyWhatsappSession,
    ).toBe(false);
  });

  it("override de conversa Baileys para Cloud API: aplica pelo destino e o alerta segue o provider efetivo", () => {
    const scope = resolveWhatsappSessionScope({
      selectedOutbound: cloud,
      conversationChannelType: "WHATSAPP",
      conversationChannelProvider: "BAILEYS_MD",
    });
    expect(scope.applyWhatsappSession).toBe(true);
    expect(scope.channelProvider).toBe("BAILEYS_MD");
    expect(scope.effectiveProvider).toBe("META_CLOUD_API");
    expect(
      isWhatsappComposerSessionExpired({
        applyWhatsappSession: scope.applyWhatsappSession,
        channelOverrideActive: true,
        ...closed,
        channelProvider: scope.channelProvider,
        selectedChannelProvider: scope.selectedChannelProvider,
      }),
    ).toBe(true);
    // O ChatArea recebe o efetivo (Cloud API) — o SessionAlert aparece.
    expect(isBaileysChannelProvider(scope.effectiveProvider)).toBe(false);
  });
});
