import { describe, expect, it } from "vitest";

import { POST } from "@/app/proofread/route";

describe("POST /proofread", () => {
  it("bloqueia texto com erro e sugere correção", async () => {
    const req = new Request("http://localhost/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Isto eh um erro gravissimo de ortografia.",
        language: "pt-BR",
      }),
    });
    const res = await POST(req as never);
    const json = (await res.json()) as {
      ok: boolean;
      suggested: string;
      matches: { message: string }[];
    };
    expect(res.status).toBe(200);
    expect(json.ok).toBe(false);
    expect(json.matches.length).toBeGreaterThan(0);
    expect(json.suggested).toMatch(/gravíssimo/i);
  }, 20_000);

  it("aplica as sugestões no texto proposto", async () => {
    const text = "esta e uma menssagem sem nenhum assento";
    const req = new Request("http://localhost/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "pt-BR" }),
    });
    const res = await POST(req as never);
    const json = (await res.json()) as {
      ok: boolean;
      original: string;
      suggested: string;
      matches: { replacements: string[] }[];
    };
    expect(res.status).toBe(200);
    expect(json.original).toBe(text);
    expect(json.ok).toBe(false);
    expect(json.suggested).toBe("Esta e uma mensagem sem nenhum assento");
    expect(json.matches.some((m) => m.replacements[0] === "mensagem")).toBe(true);
  }, 20_000);

  it("aplica pontuação no texto proposto", async () => {
    const text =
      "Oi Marcelo, tudo bem Entao vou tentar de ajudar por aqui, tem um geito melhor de fazer isso";
    const req = new Request("http://localhost/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "pt-BR" }),
    });
    const res = await POST(req as never);
    const json = (await res.json()) as { suggested: string };
    expect(res.status).toBe(200);
    expect(json.suggested.startsWith("Oi,")).toBe(true);
    expect(json.suggested).toMatch(/jeito/);
    expect(json.suggested.trim().endsWith(".")).toBe(true);
  }, 20_000);

  it("rejeita body sem texto", async () => {
    const req = new Request("http://localhost/proofread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });
});
