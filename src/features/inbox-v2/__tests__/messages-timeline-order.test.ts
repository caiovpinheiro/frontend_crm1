/**
 * Ordem da linha do tempo da conversa (aba "Conversa" do negócio e Inbox).
 *
 * Caso real (25/11, depois de um `#reset`): o contato tinha, além do ticket
 * atual, conversas ainda ATIVAS de 28/10 e 10–11/11 no mesmo canal. A
 * página (`GET …/messages`) junta todas em ordem; o prefetch do histórico
 * traz o ticket encerrado pelo `#reset` (hoje). O cliente colava o
 * histórico ANTES da página inteira — as mensagens de 10/11 e 11/11 ficavam
 * abaixo do "Conversa #N aberta". E o próximo `?history=1` usava como
 * `before` a mensagem mais antiga da lista (28/10), pulando os tickets
 * encerrados entre 28/10 e hoje.
 */
import { describe, expect, it } from "vitest";

import type { InboxMessageDto, MessagesResponse } from "@/features/inbox-v2/api";
import {
  anchorTicketSeparators,
  historyCursor,
  mergeHistory,
  sortTimeline,
} from "@/features/inbox-v2/hooks/use-messages";

function msg(id: string, createdAt: string, extra: Partial<InboxMessageDto> = {}): InboxMessageDto {
  return {
    id,
    conversationId: "conv_atual",
    direction: "in",
    content: id,
    messageType: "text",
    createdAt,
    ...extra,
  };
}

function sep(convId: string, createdAt: string, isCurrent = false): InboxMessageDto {
  return {
    id: `__ticket_sep_${convId}`,
    conversationId: convId,
    direction: "system" as InboxMessageDto["direction"],
    content: JSON.stringify({ number: 1, isCurrent }),
    messageType: "ticket-separator",
    createdAt,
  };
}

function page(messages: InboxMessageDto[], extra: Partial<MessagesResponse> = {}): MessagesResponse {
  return { messages, pinnedNoteId: null, channelProvider: null, ...extra };
}

const ids = (r: MessagesResponse | undefined) => (r?.messages ?? []).map((m) => m.id);

// Página: conversas ativas antigas do contato + ticket atual (aberto
// 21:57:56.469, 1ª mensagem com timestamp do WhatsApp 21:57:55).
const PAGE = page(
  [
    msg("ativa_2810", "2026-10-28T13:21:52.572Z"),
    msg("ativa_1011", "2026-11-11T01:23:08.000Z"),
    msg("ativa_1111", "2026-11-11T12:00:00.000Z"),
    msg("atual_1", "2026-11-26T00:57:55.000Z"),
    msg("atual_2", "2026-11-26T00:58:10.000Z"),
  ],
  { hasMore: false, hasOlderTickets: true },
);

// 1ª fatia do histórico: o ticket encerrado pelo `#reset` + separador atual.
const HIST_1 = page(
  [
    sep("conv_reset", "2026-11-25T21:53:47.043Z"),
    msg("reset_1", "2026-11-25T21:53:45.000Z"),
    msg("reset_2", "2026-11-25T22:10:00.000Z"),
    msg("reset_confirmacao", "2026-11-26T00:57:52.071Z"),
    sep("conv_atual", "2026-11-26T00:57:56.469Z", true),
  ],
  { hasOlderTickets: true },
);

describe("linha do tempo da conversa em ordem cronológica", () => {
  it("histórico mesclado não deixa conversa ativa antiga abaixo do ticket atual", () => {
    const merged = mergeHistory(PAGE, HIST_1);
    expect(ids(merged)).toEqual([
      "ativa_2810",
      "ativa_1011",
      "ativa_1111",
      "__ticket_sep_conv_reset",
      "reset_1",
      "reset_2",
      "reset_confirmacao",
      "__ticket_sep_conv_atual",
      "atual_1",
      "atual_2",
    ]);
  });

  it("dias em ordem: nenhuma mensagem mais antiga depois de uma mais nova", () => {
    const merged = mergeHistory(PAGE, HIST_1)!;
    const real = merged.messages.filter((m) => m.messageType !== "ticket-separator");
    const times = real.map((m) => m.createdAt);
    expect(times).toEqual([...times].sort());
  });

  it("divisor do ticket fica acima da 1ª mensagem dele mesmo com timestamp anterior à abertura", () => {
    const anchored = anchorTicketSeparators(HIST_1.messages);
    const sepReset = anchored.find((m) => m.id === "__ticket_sep_conv_reset")!;
    const sepAtual = anchored.find((m) => m.id === "__ticket_sep_conv_atual")!;
    // Ticket anterior: a 1ª mensagem (21:53:45) é antes da abertura (21:53:47).
    expect(sepReset.timelineAt).toBe("2026-11-25T21:53:45.000Z");
    // Ticket atual: logo depois da última mensagem do ticket encerrado.
    expect(sepAtual.timelineAt).toBe("2026-11-26T00:57:52.072Z");
  });

  it("próximo ?history=1 usa a mensagem mais antiga dos tickets encerrados, não a da conversa ativa", () => {
    expect(historyCursor(PAGE)).toBeNull();
    const merged = mergeHistory(PAGE, HIST_1)!;
    expect(historyCursor(merged)).toBe("2026-11-25T21:53:45.000Z");

    // 2ª fatia: ticket de 11/11, intercalado com a conversa ativa de 10–11/11.
    const hist2 = page(
      [
        sep("conv_1111", "2026-11-11T10:40:58.350Z"),
        msg("t1111_1", "2026-11-11T10:40:55.000Z"),
        msg("t1111_2", "2026-11-11T11:21:09.282Z"),
        sep("conv_atual", "2026-11-26T00:57:56.469Z", true),
      ],
      { hasOlderTickets: true },
    );
    const merged2 = mergeHistory(merged, hist2)!;
    expect(historyCursor(merged2)).toBe("2026-11-11T10:40:55.000Z");
    expect(ids(merged2)).toEqual([
      "ativa_2810",
      "ativa_1011",
      "__ticket_sep_conv_1111",
      "t1111_1",
      "t1111_2",
      "ativa_1111",
      "__ticket_sep_conv_reset",
      "reset_1",
      "reset_2",
      "reset_confirmacao",
      "__ticket_sep_conv_atual",
      "atual_1",
      "atual_2",
    ]);
    // O separador atual não é duplicado nem muda de lugar.
    expect(merged2.messages.filter((m) => m.id === "__ticket_sep_conv_atual")).toHaveLength(1);
  });

  it("sem histórico (página só do ticket atual) a ordem do servidor é mantida", () => {
    const list = [msg("a", "2026-11-26T00:00:00.000Z"), msg("b", "2026-11-26T00:00:00.000Z")];
    expect(sortTimeline(list)).toBe(list);
  });

  it("item sem horário fica junto do anterior", () => {
    const list = [
      msg("b", "2026-11-26T00:00:02.000Z"),
      msg("sem_hora", ""),
      msg("a", "2026-11-26T00:00:01.000Z"),
    ];
    expect(sortTimeline(list).map((m) => m.id)).toEqual(["a", "b", "sem_hora"]);
  });
});
