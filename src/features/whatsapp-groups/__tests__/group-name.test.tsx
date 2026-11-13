/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks", () => ({
  useWhatsAppGroupMutations: () => ({ setCustomName: { mutate: h.mutate, isPending: false } }),
}));

import { GroupName, groupDisplayName, groupMatchesSearch } from "../group-name";

const base = {
  id: "g1", jid: "1@g.us", name: "DNA x CONFIANÇA", description: null, ownerJid: null, participantCount: 5,
  syncedAt: "", lastMessageAt: null, lastMessagePreview: null, lastMessageAuthor: null, lastMessageFromMe: false,
  unreadCount: 0, members: [], company: null,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("nome exibido do grupo", () => {
  it("apelido vence; sem apelido, nome do WhatsApp; sem nenhum, texto padrão", () => {
    expect(groupDisplayName({ name: "DNA x CONFIANÇA", customName: "Confiança - RH" })).toBe("Confiança - RH");
    expect(groupDisplayName({ name: "DNA x CONFIANÇA", customName: "  " })).toBe("DNA x CONFIANÇA");
    expect(groupDisplayName({ name: "DNA x CONFIANÇA" })).toBe("DNA x CONFIANÇA");
    expect(groupDisplayName({ name: "", customName: null })).toBe("Grupo sem nome");
  });

  it("busca acha pelo apelido e pelo nome do WhatsApp", () => {
    const g = { name: "DNA x CONFIANÇA", customName: "Loja 04" };
    expect(groupMatchesSearch(g, "loja")).toBe(true);
    expect(groupMatchesSearch(g, "confiança")).toBe(true);
    expect(groupMatchesSearch(g, "outro")).toBe(false);
  });
});

describe("renomear no painel", () => {
  it("mostra o apelido e o nome do WhatsApp embaixo", () => {
    render(<GroupName group={{ ...base, customName: "Confiança - RH" }} />);
    expect(screen.getByText("Confiança - RH")).toBeTruthy();
    expect(screen.getByText("No WhatsApp: DNA x CONFIANÇA")).toBeTruthy();
  });

  it("sem apelido não mostra a linha do WhatsApp", () => {
    render(<GroupName group={base} />);
    expect(screen.getByText("DNA x CONFIANÇA")).toBeTruthy();
    expect(screen.queryByText(/No WhatsApp:/)).toBeNull();
  });

  it("lápis edita e salva o apelido limpo", () => {
    render(<GroupName group={base} />);
    fireEvent.click(screen.getByLabelText("Renomear grupo no CRM"));
    fireEvent.change(screen.getByLabelText("Nome do grupo no CRM"), { target: { value: "  Confiança   RH " } });
    fireEvent.click(screen.getByLabelText("Salvar nome"));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: "g1", customName: "Confiança RH" });
  });

  it("apagar ou voltar ao nome do WhatsApp remove o apelido", () => {
    render(<GroupName group={{ ...base, customName: "Loja 04" }} />);
    fireEvent.click(screen.getByLabelText("Renomear grupo no CRM"));
    fireEvent.change(screen.getByLabelText("Nome do grupo no CRM"), { target: { value: "" } });
    fireEvent.click(screen.getByLabelText("Salvar nome"));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: "g1", customName: null });
  });

  it("sem mudança não chama o servidor", () => {
    render(<GroupName group={base} />);
    fireEvent.click(screen.getByLabelText("Renomear grupo no CRM"));
    fireEvent.click(screen.getByLabelText("Salvar nome"));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText("DNA x CONFIANÇA")).toBeTruthy();
  });
});
