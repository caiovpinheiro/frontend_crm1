/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  summary: {
    data: {
      counts: { media: 7, docs: 1, links: 1 },
      recent: [
        { id: "i1", messageType: "image", mediaUrl: "/api/storage/o/b/1.jpg", mimeType: "image/jpeg", fileName: null, text: "", author: "caio", fromMe: false, createdAt: "2026-11-13T12:00:00.000Z" },
      ],
    },
    isLoading: false,
  },
}));

vi.mock("../hooks", () => ({
  useWhatsAppGroupMediaSummary: () => h.summary,
  useWhatsAppGroupMediaTab: (_id: string, kind: string) => ({
    isLoading: false,
    isError: false,
    hasNextPage: false,
    data: {
      pages: [
        {
          items:
            kind === "docs"
              ? [{ id: "d1", messageType: "document", mediaUrl: "/api/storage/o/b/a.pdf", mimeType: "application/pdf", fileName: "proposta.pdf", text: "📎 proposta.pdf", author: "William", fromMe: false, createdAt: "2026-11-12T12:00:00.000Z" }]
              : [],
        },
      ],
    },
  }),
  useWhatsAppGroupLinks: () => ({
    isLoading: false,
    isError: false,
    hasNextPage: false,
    data: { pages: [{ links: [{ id: "m1:0", url: "https://dnawork.com.br/vagas", domain: "dnawork.com.br", snippet: "vagas aqui", author: "William", fromMe: false, createdAt: "2026-11-13T12:00:00.000Z" }] }] },
  }),
}));
vi.mock("@/components/crm/image-lightbox", () => ({ ImageLightbox: () => null }));
vi.mock("@/features/team-chat/avatar", () => ({ GroupGlyph: () => <span>#</span> }));

import { GroupInfoPanel } from "../group-info-panel";

const group = {
  id: "g1", jid: "1@g.us", name: "Teste Grupo", description: null, ownerJid: null, participantCount: 3,
  syncedAt: "", lastMessageAt: null, lastMessagePreview: null, lastMessageAuthor: null, lastMessageFromMe: false,
  unreadCount: 0, members: [],
};

afterEach(cleanup);

describe("Dados do grupo", () => {
  it("mostra nome, participantes, total e prévia com +N", () => {
    render(<GroupInfoPanel group={group} memberCount={3} members={<li>caio</li>} onClose={() => {}} />);
    expect(screen.getAllByText("Teste Grupo").length).toBeGreaterThan(0);
    expect(screen.getByText("3 participantes")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("+6")).toBeTruthy();
    expect(screen.getByText("caio")).toBeTruthy();
  });

  it("abre Mídia, links e docs e troca de aba", () => {
    render(<GroupInfoPanel group={group} memberCount={3} members={null} onClose={() => {}} />);
    fireEvent.click(screen.getByText("Mídia, links e docs"));
    expect(screen.getByText("Nenhuma foto ou vídeo neste grupo ainda.")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Documentos/ }));
    expect(screen.getByText("proposta.pdf")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Links/ }));
    const link = screen.getByText("dnawork.com.br").closest("a")!;
    expect(link.getAttribute("href")).toBe("https://dnawork.com.br/vagas");
    expect(link.getAttribute("target")).toBe("_blank");
    fireEvent.click(screen.getByLabelText("Voltar"));
    expect(screen.getByText("Dados do grupo")).toBeTruthy();
  });
});
