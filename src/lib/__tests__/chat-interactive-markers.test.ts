import { describe, expect, it } from "vitest";

import {
  parseChatInteractiveMarkers,
  stripChatInteractiveMarkers,
} from "@/lib/chat-interactive-markers";

describe("chat-interactive-markers", () => {
  it("separa [Botões:] do corpo", () => {
    const parsed = parseChatInteractiveMarkers(
      "Você tem mais alguma dúvida?\n[Botões: Preciso de ajuda, Não!, Voltar para o início]",
    );
    expect(parsed.text).toBe("Você tem mais alguma dúvida?");
    expect(parsed.buttons).toEqual([
      "Preciso de ajuda",
      "Não!",
      "Voltar para o início",
    ]);
  });

  it("separa [Lista:] do corpo", () => {
    const parsed = parseChatInteractiveMarkers(
      "Selecione para dar andamento na conversa.\n[Lista: Acesso a Plataforma, Financeiro, Falar com equipe, Cancelamento/trancamento]",
    );
    expect(parsed.text).toBe("Selecione para dar andamento na conversa.");
    expect(parsed.buttons).toEqual([
      "Acesso a Plataforma",
      "Financeiro",
      "Falar com equipe",
      "Cancelamento/trancamento",
    ]);
  });

  it("remove o marcador da citação", () => {
    expect(
      stripChatInteractiveMarkers(
        "Você tem mais alguma dúvida? [Botões: Preciso de ajuda, Não!, Voltar para o início]",
      ),
    ).toBe("Você tem mais alguma dúvida?");
  });
});
