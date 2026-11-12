import { describe, expect, it } from "vitest";

import {
  appendPendingMessage,
  dropPendingMessage,
  groupMessagesByDay,
  isFirstOfRun,
  mergeServerMessages,
  optimisticGroupMessage,
  settlePendingMessage,
} from "../thread";
import type { WhatsAppGroupMessage } from "../types";

const msg = (id: string, over: Partial<WhatsAppGroupMessage> = {}): WhatsAppGroupMessage => ({
  id,
  fromJid: "a@s.whatsapp.net",
  fromName: "Ana",
  fromPhone: null,
  fromMe: false,
  text: id,
  createdAt: "2026-11-12T10:00:00.000Z",
  ...over,
});

describe("grupos WhatsApp — envio otimista", () => {
  it("a mensagem aparece na hora, marcada como pendente", () => {
    const tmp = optimisticGroupMessage("oi", "tmp-1");
    const next = appendPendingMessage({ messages: [msg("m1")] }, tmp);
    expect(next.messages.map((m) => m.id)).toEqual(["m1", "tmp-1"]);
    expect(next.messages[1]).toMatchObject({ fromMe: true, pending: true, text: "oi" });
  });

  it("cache vazio também recebe a otimista", () => {
    expect(appendPendingMessage(undefined, optimisticGroupMessage("x", "t")).messages).toHaveLength(1);
  });

  it("sucesso troca a otimista pela gravada", () => {
    const cache = { messages: [msg("m1"), optimisticGroupMessage("oi", "t")] };
    const saved = msg("m2", { fromMe: true, text: "oi" });
    expect(settlePendingMessage(cache, "t", saved).messages).toEqual([msg("m1"), saved]);
  });

  it("não duplica se o poll já trouxe a gravada", () => {
    const saved = msg("m2", { fromMe: true });
    const cache = { messages: [saved, optimisticGroupMessage("oi", "t")] };
    expect(settlePendingMessage(cache, "t", saved).messages).toEqual([saved]);
  });

  it("enviada sem histórico gravado: o texto fica na tela, sem 'pendente'", () => {
    const cache = { messages: [optimisticGroupMessage("oi", "t")] };
    const out = settlePendingMessage(cache, "t", null).messages;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "oi", pending: false, local: true });
  });

  it("enviada sem histórico continua na tela depois do poll, até o servidor ter a sua", () => {
    const prev = settlePendingMessage({ messages: [optimisticGroupMessage("oi", "t")] }, "t", null);
    expect(mergeServerMessages([msg("m1")], prev).map((m) => m.id)).toEqual(["m1", "t"]);
    expect(mergeServerMessages([msg("m9", { fromMe: true, text: "oi" })], prev).map((m) => m.id)).toEqual(["m9"]);
  });

  it("erro tira a otimista", () => {
    const cache = { messages: [msg("m1"), optimisticGroupMessage("oi", "t")] };
    expect(dropPendingMessage(cache, "t").messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("poll do servidor mantém as pendentes no fim", () => {
    const prev = { messages: [msg("m1"), optimisticGroupMessage("oi", "t")] };
    expect(mergeServerMessages([msg("m1"), msg("m3")], prev).map((m) => m.id)).toEqual(["m1", "m3", "t"]);
    expect(mergeServerMessages([msg("m1")], undefined).map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("grupos WhatsApp — agrupamento da conversa", () => {
  it("separa por dia preservando a ordem", () => {
    const days = groupMessagesByDay([
      msg("a", { createdAt: "2026-11-10T12:00:00.000Z" }),
      msg("b", { createdAt: "2026-11-10T13:00:00.000Z" }),
      msg("c", { createdAt: "2026-11-12T12:00:00.000Z" }),
    ]);
    expect(days.map((d) => d.items.map((m) => m.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("nome só na primeira bolha de uma sequência da mesma pessoa", () => {
    const items = [msg("a"), msg("b"), msg("c", { fromJid: "b@s.whatsapp.net" }), msg("d", { fromMe: true })];
    expect(items.map((_, i) => isFirstOfRun(items, i))).toEqual([true, false, true, true]);
  });
});
