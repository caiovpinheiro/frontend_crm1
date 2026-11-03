/** @vitest-environment jsdom */
/**
 * "Enviar por" segue o número em que o cliente escreveu por último. A escolha
 * manual do consultor vale até a próxima mensagem do cliente.
 */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findLastInboundMessage,
  useSelectedOutboundChannel,
  type OutboundChannelOption,
} from "../hooks/use-channels";

const CHANNELS = [
  { id: "ch-comercial", name: "Comercial", type: "WHATSAPP", phoneNumber: "+55 11 91747-9873" },
  { id: "ch-comercial-2", name: "Comercial 2", type: "WHATSAPP", phoneNumber: "+55 11 94262-2310" },
] as unknown as OutboundChannelOption[];

type Inbound = { id: string | null; channelId: string } | null;

function mount(lastInbound: Inbound) {
  return renderHook(
    ({ inbound }: { inbound: Inbound }) =>
      useSelectedOutboundChannel({
        conversationId: "conv-1",
        conversationChannelId: "ch-comercial-2",
        availableChannels: CHANNELS,
        lastMessageChannelId: "ch-comercial-2",
        lastInbound: inbound,
      }),
    { initialProps: { inbound: lastInbound } },
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("findLastInboundMessage", () => {
  it("pega a última mensagem do cliente, ignorando envio, nota e evento", () => {
    expect(
      findLastInboundMessage([
        { id: "m1", direction: "in", channelId: "ch-comercial-2" },
        { id: "m2", direction: "in", channelId: "ch-comercial" },
        { id: "m3", direction: "out", channelId: "ch-comercial-2" },
        { id: "m4", direction: "in", channelId: "ch-comercial-2", isPrivate: true },
        { id: "m5", direction: "in", channelId: "ch-comercial-2", messageType: "event" },
      ]),
    ).toEqual({ id: "m2", channelId: "ch-comercial" });
  });

  it("sem mensagem do cliente com canal devolve null", () => {
    expect(findLastInboundMessage([{ id: "m1", direction: "out", channelId: "x" }])).toBeNull();
    expect(findLastInboundMessage(undefined)).toBeNull();
  });
});

describe("useSelectedOutboundChannel com o canal do cliente", () => {
  it("seleciona o canal em que o cliente escreveu, não o da conversa", () => {
    const { result } = mount({ id: "m2", channelId: "ch-comercial" });
    expect(result.current.selectedChannelId).toBe("ch-comercial");
  });

  it("escolha manual vale até a próxima mensagem do cliente", () => {
    const { result, rerender } = mount({ id: "m2", channelId: "ch-comercial" });
    act(() => result.current.setSelectedChannelId("ch-comercial-2"));
    expect(result.current.selectedChannelId).toBe("ch-comercial-2");

    // Mesma mensagem do cliente (ex.: reabrir a conversa): a escolha fica.
    rerender({ inbound: { id: "m2", channelId: "ch-comercial" } });
    expect(result.current.selectedChannelId).toBe("ch-comercial-2");

    // Cliente escreveu de novo pelo Comercial: troca sozinho.
    rerender({ inbound: { id: "m9", channelId: "ch-comercial" } });
    expect(result.current.selectedChannelId).toBe("ch-comercial");
  });

  it("escolha salva no formato antigo cede ao canal do cliente", () => {
    window.localStorage.setItem("eduit:inbox:selected-channel:conv-1", "ch-comercial-2");
    const { result } = mount({ id: "m2", channelId: "ch-comercial" });
    expect(result.current.selectedChannelId).toBe("ch-comercial");
  });

  it("sem mensagem do cliente mantém a escolha manual", () => {
    window.localStorage.setItem(
      "eduit:inbox:selected-channel:conv-1",
      JSON.stringify({ channelId: "ch-comercial", afterInboundId: null }),
    );
    const { result } = mount(null);
    expect(result.current.selectedChannelId).toBe("ch-comercial");
  });
});
