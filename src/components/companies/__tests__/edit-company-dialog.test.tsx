/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/directory-v2/hooks", () => ({
  useUpdateCompany: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, isError: false }),
}));

import { EditCompanyDialog } from "../edit-company-dialog";

const base = {
  id: "c1", name: "ASP Vinhedo", size: "28.021.619/0012-54", phone: "+551938719886",
  domain: "x@y.com", cep: "13284-206", city: "Vinhedo", state: "SP", address: "Rua São Paulo, 140",
};

describe("EditCompanyDialog — número (ID)", () => {
  afterEach(cleanup);

  it("mostra o número da empresa, somente leitura", () => {
    render(<EditCompanyDialog company={{ ...base, number: 14 }} onClose={() => {}} />);
    const input = screen.getByLabelText("Número (ID)") as HTMLInputElement;
    expect(input.value).toBe("#14");
    expect(input.readOnly).toBe(true);
  });

  it("sem número (payload antigo) não quebra a modal", () => {
    render(<EditCompanyDialog company={base} onClose={() => {}} />);
    expect(screen.queryByLabelText("Número (ID)")).toBeNull();
    expect(screen.getByDisplayValue("ASP Vinhedo")).toBeTruthy();
  });
});
