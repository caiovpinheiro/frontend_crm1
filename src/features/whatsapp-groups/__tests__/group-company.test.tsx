/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  companies: [
    { id: "c1", name: "5RS Sucata Digital Eirelli", city: "São Paulo", state: "SP", domain: "5rs@gmail.com" },
    { id: "c2", name: "ASP Paraiso", city: null, state: null, domain: null },
  ],
  lastSearch: undefined as string | undefined,
  dialogCompany: undefined as unknown,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("../hooks", () => ({
  useWhatsAppGroupMutations: () => ({
    setCompany: { mutate: h.mutate, isPending: false },
    refreshGroup: vi.fn(),
  }),
}));
vi.mock("@/features/directory-v2/hooks", () => ({
  useCompanies: (p: { search?: string }) => {
    h.lastSearch = p.search;
    return { isLoading: false, data: { items: h.companies } };
  },
  useCompany: (id: string | null) => ({ data: id ? { id, name: "5RS Sucata Digital Eirelli" } : undefined, isError: false }),
}));
vi.mock("@/components/companies/edit-company-dialog", () => ({
  EditCompanyDialog: ({ company }: { company: unknown }) => {
    h.dialogCompany = company;
    return company ? <div>popup-editar-empresa</div> : null;
  },
}));

import { GroupCompany } from "../group-company";

const base = {
  id: "g1", jid: "1@g.us", name: "Teste Grupo", description: null, ownerJid: null, participantCount: 3,
  syncedAt: "", lastMessageAt: null, lastMessagePreview: null, lastMessageAuthor: null, lastMessageFromMe: false,
  unreadCount: 0, members: [],
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Empresa vinculada ao grupo", () => {
  it("sem empresa: busca e vincula", () => {
    render(<GroupCompany group={{ ...base, company: null }} />);
    fireEvent.click(screen.getByText("Vincular empresa"));
    fireEvent.change(screen.getByLabelText("Buscar empresa"), { target: { value: "5RS" } });
    expect(h.lastSearch).toBe("5RS");
    fireEvent.click(screen.getByText("5RS Sucata Digital Eirelli"));
    expect(h.mutate).toHaveBeenCalledWith({ id: "g1", companyId: "c1" }, expect.anything());
  });

  it("com empresa: nome completo abre o popup de editar; desvincular manda null", () => {
    render(<GroupCompany group={{ ...base, company: { id: "c1", number: 4, name: "5RS Sucata Digital Eirelli" } }} />);
    expect(screen.queryByText("popup-editar-empresa")).toBeNull();
    fireEvent.click(screen.getByText("5RS Sucata Digital Eirelli"));
    expect(screen.getByText("popup-editar-empresa")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Desvincular empresa"));
    expect(h.mutate).toHaveBeenCalledWith({ id: "g1", companyId: null }, expect.anything());
  });

  it("trocar abre a busca de novo", () => {
    render(<GroupCompany group={{ ...base, company: { id: "c1", number: 4, name: "5RS Sucata Digital Eirelli" } }} />);
    fireEvent.click(screen.getByLabelText("Trocar empresa"));
    fireEvent.click(screen.getByText("ASP Paraiso"));
    expect(h.mutate).toHaveBeenCalledWith({ id: "g1", companyId: "c2" }, expect.anything());
  });
});
