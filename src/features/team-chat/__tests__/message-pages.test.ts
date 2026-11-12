import { describe, expect, it } from "vitest";

import { mergeMessageLists, pageHasMore, prependOlderMessages } from "../message-pages";
import type { TeamChatMessage } from "../types";

const m = (id: string, day: number) =>
  ({ id, createdAt: `2026-11-${String(day).padStart(2, "0")}T10:00:00.000Z` }) as TeamChatMessage;

describe("bWiPO Chat — histórico paginado", () => {
  it("o poll não apaga as mensagens antigas carregadas com 'anteriores'", () => {
    const cached = [m("old1", 2), m("old2", 3), m("a", 10), m("b", 11)];
    const fetched = [m("a", 10), m("b", 11)];
    expect(mergeMessageLists(cached, fetched).map((x) => x.id)).toEqual(["old1", "old2", "a", "b"]);
  });

  it("mantém as que chegaram por SSE depois do GET", () => {
    const cached = [m("a", 10), m("b", 11), m("c", 12)];
    expect(mergeMessageLists(cached, [m("a", 10), m("b", 11)]).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("apagada dentro da janela da página sai do cache", () => {
    const cached = [m("a", 10), m("x", 11), m("b", 12)];
    expect(mergeMessageLists(cached, [m("a", 10), m("b", 12)]).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("cache vazio usa a página como veio", () => {
    const fetched = [m("a", 10)];
    expect(mergeMessageLists(undefined, fetched)).toBe(fetched);
  });

  it("anteriores entram no começo, em ordem e sem duplicar", () => {
    const out = prependOlderMessages([m("a", 10), m("b", 11)], [m("y", 4), m("a", 10), m("z", 5)]);
    expect(out.map((x) => x.id)).toEqual(["y", "z", "a", "b"]);
  });

  it("página cheia indica que há mais", () => {
    expect(pageHasMore(80)).toBe(true);
    expect(pageHasMore(79)).toBe(false);
  });
});
