/** @vitest-environment jsdom */
/**
 * L6 — Contatos no celular: lista de cards (nome, telefone, origem,
 * responsável) em vez da tabela com rolagem horizontal.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/inbox/chat-avatar", () => ({
  ChatAvatar: () => <span data-testid="avatar" />,
}));

import type { ContactListItemDto } from "@/features/directory-v2/api";

import { ContactMobileCards } from "../contact-mobile-cards";

function contact(over: Partial<ContactListItemDto> = {}): ContactListItemDto {
  return {
    id: "c1",
    name: "Maria Aparecida de Souza Albuquerque",
    email: "maria@empresa.com",
    phone: "5511999998888",
    avatarUrl: null,
    leadScore: null,
    lifecycleStage: "LEAD",
    source: "Instagram",
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    assignedTo: { id: "u1", name: "Beatriz Lima", avatarUrl: null },
    company: null,
    tags: [],
    customFields: {},
    ...over,
  };
}

function renderCards(over: Partial<React.ComponentProps<typeof ContactMobileCards>> = {}) {
  const props: React.ComponentProps<typeof ContactMobileCards> = {
    items: [contact(), contact({ id: "c2", name: "João", source: null, assignedTo: null, phone: null })],
    selected: new Set<string>(),
    allChecked: false,
    someChecked: false,
    onToggleAll: vi.fn(),
    onToggleOne: vi.fn(),
    onEdit: vi.fn(),
    onOpenLead: vi.fn(),
    openingLeadId: null,
    ...over,
  };
  render(<ContactMobileCards {...props} />);
  return props;
}

afterEach(() => cleanup());

describe("ContactMobileCards", () => {
  it("cada contato vira um card com nome, telefone, origem e responsável", () => {
    renderCards();
    const cards = screen.getAllByTestId("contact-mobile-card");
    expect(cards).toHaveLength(2);
    const first = within(cards[0]!);
    expect(first.getByText("Maria Aparecida de Souza Albuquerque")).toBeTruthy();
    expect(first.getByText("Instagram")).toBeTruthy();
    expect(first.getByText("Beatriz Lima")).toBeTruthy();
    expect(first.getByText("Telefone")).toBeTruthy();
    expect(first.getByText("Origem")).toBeTruthy();
    expect(first.getByText("Responsável")).toBeTruthy();
    // telefone vira link tel:
    const tel = first.getByRole("link");
    expect(tel.getAttribute("href")).toBe("tel:5511999998888");
    // sem dados: travessão, sem quebrar
    const second = within(cards[1]!);
    expect(second.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("nome longo tem title (truncado com reticências, completo no tooltip)", () => {
    renderCards();
    const name = screen.getByTitle("Maria Aparecida de Souza Albuquerque");
    expect(name.tagName).toBe("BUTTON");
  });

  it("toque no card abre a edição; checkbox seleciona; 'Selecionar todos' alterna", () => {
    const props = renderCards();
    fireEvent.click(screen.getByTitle("Maria Aparecida de Souza Albuquerque"));
    expect(props.onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }));

    fireEvent.click(screen.getByLabelText("Selecionar Maria Aparecida de Souza Albuquerque"));
    expect(props.onToggleOne).toHaveBeenCalledWith("c1");

    fireEvent.click(screen.getByLabelText("Selecionar todos"));
    expect(props.onToggleAll).toHaveBeenCalled();
  });

  it("botões de ação têm 40×40 px (size-10) e o checkbox usa alvo de toque", () => {
    renderCards();
    const lead = screen.getAllByLabelText(/Abrir lead de/)[0]!;
    const edit = screen.getAllByLabelText(/Editar /)[0]!;
    expect(lead.className).toContain("size-10");
    expect(edit.className).toContain("size-10");
    expect(screen.getByLabelText("Selecionar todos").className).toContain("touch-target-40");
  });

  it("só aparece abaixo de md (a tabela cobre md+)", () => {
    renderCards();
    expect(screen.getByTestId("contacts-mobile-list").className).toContain("md:hidden");
  });
});

describe("client-page de Contatos — layout do celular", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/contacts/client-page.tsx"),
    "utf8",
  );

  it("totais em grade 2×2 abaixo de md (o scroll horizontal de quadrados fica em md–lg)", () => {
    expect(source).toContain('data-testid="contacts-kpi-grid-mobile"');
    expect(source).toContain("grid w-full grid-cols-2 gap-2 md:hidden");
    expect(source).toContain('className="toolbar-hscroll hidden min-w-0 max-w-full md:block lg:hidden"');
  });

  it("busca em linha própria no celular (placeholder completo)", () => {
    expect(source).toContain("stackSearchOnMobile");
  });

  it("a tabela com rolagem horizontal só existe a partir de md", () => {
    expect(source).toContain('className="relative hidden min-w-0 md:block lg:hidden"');
  });
});
