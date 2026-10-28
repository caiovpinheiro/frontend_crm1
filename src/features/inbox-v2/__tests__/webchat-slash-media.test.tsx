/** @vitest-environment jsdom */
/**
 * Menu "/" em conversa Webchat (canal sem anexo): modelos internos e
 * mensagens rápidas com mídia não aparecem — o visitante receberia uma bolha
 * vazia. Só texto continua disponível.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: "u1" } }, status: "authenticated" }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { slashRowHasMedia, useSlashMenu } from "@/components/inbox/slash-command-menu";

const TEMPLATES = [
  { id: "t-text", name: "Só texto", content: "Olá!", category: null, channelType: null },
  {
    id: "t-legacy",
    name: "Com imagem",
    content: "Veja",
    category: null,
    channelType: null,
    mediaUrl: "https://cdn.test/a.png",
  },
  {
    id: "t-multi",
    name: "Com anexos",
    content: "Segue",
    category: null,
    channelType: null,
    attachments: [{ url: "https://cdn.test/b.pdf", name: "b.pdf" }],
  },
];
const QUICK = [
  { id: "q-text", title: "Rápida", content: "Já volto", group: null },
  { id: "q-file", title: "Catálogo", content: "Segue", attachmentUrl: "https://cdn.test/c.pdf" },
];

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function setup(mediaEnabled: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return renderHook(
    () =>
      useSlashMenu({
        draft: "/",
        setDraft: () => {},
        textareaRef: { current: null },
        onPickMetaTemplate: () => {},
        whatsappFeatures: false,
        mediaEnabled,
      }),
    { wrapper },
  );
}

describe("menu / sem anexo (Webchat)", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("/api/templates")) return json(TEMPLATES);
        if (url.includes("/api/settings/quick-replies")) return json(QUICK);
        return json([]);
      }),
    );
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("esconde modelos/mensagens rápidas com mídia", async () => {
    const { result } = setup(false);
    await waitFor(() => expect(result.current.state.items.length).toBeGreaterThan(0));
    await waitFor(() =>
      expect(result.current.state.items.map((i) => i.id).sort()).toEqual(["q-text", "t-text"]),
    );
  });

  it("canal com anexo continua mostrando todos", async () => {
    const { result } = setup(true);
    await waitFor(() =>
      expect(result.current.state.items.map((i) => i.id).sort()).toEqual([
        "q-file",
        "q-text",
        "t-legacy",
        "t-multi",
        "t-text",
      ]),
    );
  });

  it("slashRowHasMedia: mediaUrl, attachments com url ou attachmentUrl", () => {
    expect(slashRowHasMedia({ mediaUrl: "https://x/a.png" })).toBe(true);
    expect(slashRowHasMedia({ attachmentUrl: "https://x/a.pdf" })).toBe(true);
    expect(slashRowHasMedia({ attachments: [{ url: "https://x/a.pdf" }] })).toBe(true);
    expect(slashRowHasMedia({ attachments: [{ url: "", messageBefore: "oi" }] })).toBe(false);
    expect(slashRowHasMedia({ mediaUrl: null, attachments: null })).toBe(false);
  });
});
