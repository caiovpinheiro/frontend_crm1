import { describe, it, expect } from "vitest";
import {
  canPublishAgent,
  showRealClientWarning,
  isModelSupported,
} from "@/lib/ai-v2/agent-start";

describe("Tela 1 — Começar", () => {
  describe("publicação bloqueada sem chave válida (item b)", () => {
    it("permite publicar quando há chave salva", () => {
      expect(canPublishAgent(true, "")).toBe(true);
    });

    it("permite publicar quando o usuário digitou uma chave que parece OpenAI", () => {
      expect(canPublishAgent(false, "sk-proj-abc1234567890xyz")).toBe(true);
    });

    it("bloqueia publicação sem chave salva e sem chave digitada", () => {
      expect(canPublishAgent(false, "")).toBe(false);
    });

    it("bloqueia publicação com texto que não parece chave OpenAI", () => {
      expect(canPublishAgent(false, "minha-senha")).toBe(false);
    });
  });

  describe("aviso de cliente real (item f)", () => {
    it("mostra aviso quando ativo, com canal e sem restrição de números", () => {
      expect(showRealClientWarning(true, ["ch_1"], [])).toBe(true);
    });

    it("não mostra aviso quando desativado", () => {
      expect(showRealClientWarning(false, ["ch_1"], [])).toBe(false);
    });

    it("não mostra aviso quando não há canal vinculado", () => {
      expect(showRealClientWarning(true, [], [])).toBe(false);
    });

    it("não mostra aviso quando há números de teste preenchidos", () => {
      expect(showRealClientWarning(true, ["ch_1"], ["11999999999"])).toBe(false);
    });
  });

  describe("modelo suportado", () => {
    it("aceita modelo que está na lista", () => {
      expect(isModelSupported("gpt-4o-mini", [{ id: "gpt-4o-mini" }, { id: "gpt-4o" }])).toBe(true);
    });

    it("rejeita modelo fora da lista", () => {
      expect(isModelSupported("gpt-5", [{ id: "gpt-4o-mini" }])).toBe(false);
    });

    it("rejeita modelo vazio", () => {
      expect(isModelSupported("", [{ id: "gpt-4o-mini" }])).toBe(false);
    });
  });
});
