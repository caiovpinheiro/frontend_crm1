import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

import { ForwardPickerList, filterForwardRows } from "@/features/inbox-v2/extras/forward-dialog";
import { ChatArea } from "../chat-area";
import { makeMessage, renderStatic } from "./chat-test-utils";

const rows = [
  { id: "src", number: 1, channel: "whatsapp", status: "OPEN" as const, contact: { id: "c0", name: "Origem", phone: "5511900000000" } },
  { id: "a", number: 2, channel: "whatsapp", status: "OPEN" as const, contact: { id: "c1", name: "José Antônio", phone: "5511987654321" } },
  { id: "b", number: 3, channel: "instagram", status: "RESOLVED" as const, contact: { id: "c2", name: "Maria Clara", phone: null } },
  { id: "c", number: 4, channel: "whatsapp", status: "OPEN" as const, contact: { id: "c3", name: "Pedro", phone: "5521912345678" } },
];

describe("encaminhar (b3-iii)", () => {
  it("filterForwardRows: exclui a origem, busca por nome sem acento e por dígitos do telefone", () => {
    expect(filterForwardRows(rows, "", "src").map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterForwardRows(rows, "jose antonio", "src").map((r) => r.id)).toEqual(["a"]);
    expect(filterForwardRows(rows, "MARIA", "src").map((r) => r.id)).toEqual(["b"]);
    expect(filterForwardRows(rows, "(21) 91234", "src").map((r) => r.id)).toEqual(["c"]);
    expect(filterForwardRows(rows, "origem", "src")).toEqual([]);
    expect(filterForwardRows(rows, "zzz")).toEqual([]);
  });

  it("ForwardPickerList: seleção múltipla marcada por aria-selected e rodapé com telefone/canal", () => {
    const html = renderStatic(
      <ForwardPickerList
        rows={filterForwardRows(rows, "", "src")}
        selected={new Set(["a", "c"])}
        onToggle={() => {}}
      />,
    );
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain('data-forward-target="a"');
    expect(html.split('aria-selected="true"').length - 1).toBe(2);
    expect(html.split('aria-selected="false"').length - 1).toBe(1);
    expect(html).toContain("+55 (11) 98765-4321");
    expect(html).toContain("Instagram");
    expect(html).toContain("encerrada");
    expect(renderStatic(<ForwardPickerList rows={[]} selected={new Set()} onToggle={() => {}} />)).toContain(
      "Nenhuma conversa encontrada.",
    );
  });

  it("ChatArea com conversationId monta o fluxo interno sem quebrar o render", () => {
    const html = renderStatic(
      <ChatArea contact={{ name: "Maria" }} messages={[makeMessage({ id: "m1" })]} conversationId="src" />,
    );
    // Diálogo fechado: nada do picker no markup; a bolha segue com o menu.
    expect(html).not.toContain("Encaminhar mensagem");
    expect(html).toContain('aria-label="Reagir à mensagem"');
  });
});
