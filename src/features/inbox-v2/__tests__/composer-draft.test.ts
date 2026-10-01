import { describe, expect, it, vi } from "vitest";

import {
  clearComposerDraft,
  COMPOSER_DRAFT_MAX_CHARS,
  COMPOSER_DRAFT_PREFIX,
  composerDraftKey,
  readComposerDraft,
  subscribeComposerDraft,
  writeComposerDraft,
  type DraftEventTarget,
  type DraftStorage,
} from "../composer-draft";

/** localStorage falso (Map) — o vitest roda em ambiente node. */
function fakeStorage(): DraftStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

function fakeWindow() {
  const listeners = new Set<(e: { key: string | null; newValue: string | null }) => void>();
  const target: DraftEventTarget & {
    fire: (key: string | null, newValue: string | null) => void;
    size: () => number;
  } = {
    addEventListener: (_t, fn) => void listeners.add(fn),
    removeEventListener: (_t, fn) => void listeners.delete(fn),
    fire: (key, newValue) => {
      for (const fn of listeners) fn({ key, newValue });
    },
    size: () => listeners.size,
  };
  return target;
}

describe("composerDraftKey", () => {
  it("chave por org + usuário + conversa", () => {
    expect(composerDraftKey({ orgId: "o1", userId: "u1", conversationId: "c1" })).toBe(
      `${COMPOSER_DRAFT_PREFIX}o1:u1:c1`,
    );
  });

  it("sem org, usuário ou conversa não persiste", () => {
    expect(composerDraftKey({ orgId: null, userId: "u1", conversationId: "c1" })).toBeNull();
    expect(composerDraftKey({ orgId: "o1", userId: undefined, conversationId: "c1" })).toBeNull();
    expect(composerDraftKey({ orgId: "o1", userId: "u1", conversationId: null })).toBeNull();
  });
});

describe("read/write/clear", () => {
  const key = composerDraftKey({ orgId: "o", userId: "u", conversationId: "c" })!;

  it("grava, lê e remove", () => {
    const st = fakeStorage();
    expect(readComposerDraft(key, st)).toBe("");
    expect(writeComposerDraft(key, "olá", st)).toBe(true);
    expect(readComposerDraft(key, st)).toBe("olá");
    clearComposerDraft(key, st);
    expect(readComposerDraft(key, st)).toBe("");
    expect(st.map.has(key)).toBe(false);
  });

  it("texto vazio remove a chave (enviou / apagou)", () => {
    const st = fakeStorage();
    writeComposerDraft(key, "rascunho", st);
    writeComposerDraft(key, "", st);
    expect(st.map.has(key)).toBe(false);
  });

  it("corta no limite de tamanho", () => {
    const st = fakeStorage();
    writeComposerDraft(key, "x".repeat(COMPOSER_DRAFT_MAX_CHARS + 500), st);
    expect(readComposerDraft(key, st)).toHaveLength(COMPOSER_DRAFT_MAX_CHARS);
  });

  it("storage que lança (quota, privado) não derruba o composer", () => {
    const boom: DraftStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readComposerDraft(key, boom)).toBe("");
    expect(writeComposerDraft(key, "a", boom)).toBe(false);
    expect(() => clearComposerDraft(key, boom)).not.toThrow();
    expect(writeComposerDraft(key, "a", null)).toBe(false);
    expect(readComposerDraft(key, null)).toBe("");
  });
});

describe("subscribeComposerDraft (sincronização entre abas)", () => {
  const key = composerDraftKey({ orgId: "o", userId: "u", conversationId: "c" })!;

  it("recebe o texto gravado por outra aba e ignora outras chaves", () => {
    const win = fakeWindow();
    const onChange = vi.fn();
    const off = subscribeComposerDraft(key, onChange, win);
    win.fire(`${COMPOSER_DRAFT_PREFIX}o:u:OUTRA`, "não é minha");
    expect(onChange).not.toHaveBeenCalled();
    win.fire(key, "texto da outra aba");
    expect(onChange).toHaveBeenCalledWith("texto da outra aba");
    off();
    expect(win.size()).toBe(0);
    win.fire(key, "depois do unsubscribe");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("remoção (envio na outra aba) e clear() chegam como texto vazio", () => {
    const win = fakeWindow();
    const onChange = vi.fn();
    subscribeComposerDraft(key, onChange, win);
    win.fire(key, null);
    win.fire(null, null);
    expect(onChange).toHaveBeenNthCalledWith(1, "");
    expect(onChange).toHaveBeenNthCalledWith(2, "");
  });

  it("sem window (SSR) é no-op", () => {
    expect(() => subscribeComposerDraft(key, vi.fn(), null)()).not.toThrow();
  });
});
