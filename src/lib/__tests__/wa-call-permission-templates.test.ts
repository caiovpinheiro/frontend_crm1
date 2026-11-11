/**
 * Lista de templates de permissão de ligação: pede a WABA do canal da conversa
 * e não esconde erro da API como "nenhum template".
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiUrl: (p: string) => p }));

import { fetchCallPermissionTemplates } from "@/lib/wa-call-permission-send";

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchCallPermissionTemplates", () => {
  it("manda a conversa para a API escolher o canal certo", async () => {
    const fn = mockFetch(200, { items: [{ name: "ligacao1" }] });
    const items = await fetchCallPermissionTemplates("conv 1");
    expect(fn).toHaveBeenCalledWith(
      "/api/meta/whatsapp/call-permission-templates?conversationId=conv%201",
    );
    expect(items.map((i) => i.name)).toEqual(["ligacao1"]);
  });

  it("sem conversa, chama sem parâmetro", async () => {
    const fn = mockFetch(200, { items: [] });
    await fetchCallPermissionTemplates();
    expect(fn).toHaveBeenCalledWith("/api/meta/whatsapp/call-permission-templates");
  });

  it("erro da API vira exceção com a mensagem do servidor", async () => {
    mockFetch(503, { message: "Nenhum canal WhatsApp Cloud API nesta organização." });
    await expect(fetchCallPermissionTemplates("c1")).rejects.toThrow(
      "Nenhum canal WhatsApp Cloud API nesta organização.",
    );
  });

  it("erro sem mensagem usa texto padrão", async () => {
    mockFetch(500, {});
    await expect(fetchCallPermissionTemplates("c1")).rejects.toThrow(
      "Não foi possível carregar os templates de ligação.",
    );
  });
});
