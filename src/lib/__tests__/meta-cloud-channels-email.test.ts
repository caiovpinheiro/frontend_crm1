/**
 * Picker "Canais" do passo `send_email` lista as contas conectadas em
 * /email (`/api/email-accounts`), não só `Channel.type=EMAIL` (que nenhuma
 * org tem) — antes a conta da DNA Work não aparecia e sobravam os mocks.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ apiUrl: (p: string) => p }));

import {
  emailAccountToStepChannel,
  fetchConnectedEmailChannels,
} from "@/lib/meta-whatsapp/meta-cloud-channels";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("emailAccountToStepChannel", () => {
  it("usa o id da conta e o endereço como nome", () => {
    expect(
      emailAccountToStepChannel({ id: "acc_1", email: "documentos@dnawork.ai", visibility: "SHARED" }),
    ).toEqual({
      id: "acc_1",
      name: "documentos@dnawork.ai",
      type: "EMAIL",
      status: "CONNECTED",
      phoneNumber: null,
    });
  });

  it("marca conta pessoal", () => {
    expect(
      emailAccountToStepChannel({ id: "acc_2", email: "joao@dnawork.ai", visibility: "PERSONAL" }).name,
    ).toBe("joao@dnawork.ai (pessoal)");
  });
});

describe("fetchConnectedEmailChannels", () => {
  it("junta contas de e-mail com canais EMAIL legados, sem duplicar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/email-accounts") {
          return jsonResponse({
            accounts: [{ id: "acc_1", email: "documentos@dnawork.ai", visibility: "SHARED" }],
          });
        }
        return jsonResponse([
          { id: "acc_1", name: "dup", type: "EMAIL", status: "CONNECTED", phoneNumber: null },
          { id: "ch_wa", name: "WA", type: "WHATSAPP", status: "CONNECTED", phoneNumber: "+55" },
          { id: "ch_mail_off", name: "Velho", type: "EMAIL", status: "DISCONNECTED", phoneNumber: null },
          { id: "ch_mail", name: "Canal legado", type: "EMAIL", status: "CONNECTED", phoneNumber: null },
        ]);
      }),
    );
    const list = await fetchConnectedEmailChannels();
    expect(list.map((c) => c.id)).toEqual(["acc_1", "ch_mail"]);
    expect(list[0]?.name).toBe("documentos@dnawork.ai");
  });

  it("falha em /api/email-accounts (403) não derruba o picker", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/email-accounts" ? jsonResponse({ message: "nope" }, false) : jsonResponse([]),
      ),
    );
    await expect(fetchConnectedEmailChannels()).resolves.toEqual([]);
  });
});
