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
