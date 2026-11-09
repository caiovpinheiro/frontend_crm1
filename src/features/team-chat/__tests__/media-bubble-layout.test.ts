import { describe, expect, it } from "vitest";

import { mediaBubbleLayout } from "../message-list";

describe("mediaBubbleLayout — botão de ações não cobre o Baixar", () => {
  it("arquivo reserva a faixa da direita e põe o horário embaixo, fora da linha", () => {
    const l = mediaBubbleLayout("file");
    expect(l.bubbleClass).toContain("pr-9");
    expect(l.metaInline).toBe(true);
    expect(l.metaClass).not.toContain("absolute");
  });

  it("imagem e vídeo mantêm o horário sobre a mídia", () => {
    expect(mediaBubbleLayout("image").metaInline).toBe(false);
    expect(mediaBubbleLayout("video").metaInline).toBe(false);
  });

  it("áudio mantém o horário embaixo do player", () => {
    expect(mediaBubbleLayout("audio").metaInline).toBe(true);
    expect(mediaBubbleLayout("audio").bubbleClass).not.toContain("pr-9");
  });
});
