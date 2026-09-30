import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { isFindShortcut } from "../conversation-search";
import { ChatArea } from "../chat-area";
import { makeMessage, renderStatic } from "./chat-test-utils";

describe("Ctrl/Cmd+F — busca na conversa", () => {
  it("reconhece Ctrl+F e Cmd+F, em qualquer caixa", () => {
    expect(isFindShortcut({ key: "f", ctrlKey: true, metaKey: false })).toBe(true);
    expect(isFindShortcut({ key: "f", ctrlKey: false, metaKey: true })).toBe(true);
    expect(isFindShortcut({ key: "F", ctrlKey: true, metaKey: false, shiftKey: false })).toBe(true);
  });

  it("não rouba F sozinho, Ctrl+Shift+F, Alt+F nem outras letras", () => {
    expect(isFindShortcut({ key: "f", ctrlKey: false, metaKey: false })).toBe(false);
    expect(isFindShortcut({ key: "F", ctrlKey: true, metaKey: false, shiftKey: true })).toBe(false);
    expect(isFindShortcut({ key: "f", ctrlKey: true, metaKey: false, altKey: true })).toBe(false);
    expect(isFindShortcut({ key: "g", ctrlKey: true, metaKey: false })).toBe(false);
  });

  it("o container do chat é focável (tabindex=-1) para receber o atalho só com foco interno", () => {
    const html = renderStatic(
      <ChatArea
        contact={{ name: "Maria" }}
        messages={[makeMessage({ id: "m1" })]}
        conversationId="c"
      />,
    );
    expect(html).toMatch(/<main[^>]*tabindex="-1"/);
  });
});
