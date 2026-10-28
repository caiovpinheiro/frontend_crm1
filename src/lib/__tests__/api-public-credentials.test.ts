/** @vitest-environment jsdom */
/**
 * `fetch` do app × API pública: `/api/public/*` (Webchat do visitante) não
 * leva a sessão do CRM — o `credentials: "include"` forçado da reescrita para
 * o host da API vale só para as rotas autenticadas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAppFetch } from "../api";

const API = "https://api.bwipo.test";

function capture() {
  const original = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
  );
  return { original, appFetch: createAppFetch(original as unknown as typeof fetch) };
}

describe("credenciais na API pública", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", API));
  afterEach(() => vi.unstubAllEnvs());

  it("/api/public/webchat/* mantém o `credentials: \"omit\"` do widget", async () => {
    const { original, appFetch } = capture();
    await appFetch(`${API}/api/public/webchat/messages`, {
      credentials: "omit",
      headers: { Authorization: "Bearer t" },
    });
    expect(original.mock.calls[0]?.[1]?.credentials).toBe("omit");
  });

  it("sem `credentials` explícito, a API pública vai sem cookie", async () => {
    const { original, appFetch } = capture();
    await appFetch(`${API}/api/public/webchat/config?key=wc_x`);
    expect(original.mock.calls[0]?.[1]?.credentials).toBe("omit");
  });

  it("Request da API pública herda o `credentials` dele (não força include)", async () => {
    const { original, appFetch } = capture();
    await appFetch(new Request(`${API}/api/public/webchat/messages`, { credentials: "omit" }));
    const [req, init] = original.mock.calls[0]!;
    expect(init?.credentials).toBeUndefined();
    expect((req as Request).credentials).toBe("omit");
  });

  it("rotas autenticadas continuam com `credentials: \"include\"`", async () => {
    const { original, appFetch } = capture();
    await appFetch(`${API}/api/channels`, { credentials: "omit" });
    expect(original.mock.calls[0]?.[1]?.credentials).toBe("include");
  });
});
