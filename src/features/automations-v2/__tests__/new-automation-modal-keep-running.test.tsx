/** @vitest-environment jsdom */
/**
 * Passo 3 da criação: "Continuar mesmo se o consultor responder" vai no
 * corpo do POST e aparece no resumo; desligado por padrão.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  create: vi.fn(),
  push: vi.fn(),
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("../hooks", () => ({
  useCreateAutomation: () => ({ mutateAsync: h.create, isPending: false }),
}));

import { NewAutomationModal } from "../new-automation-modal";

function openStep3() {
  render(<NewAutomationModal open onOpenChange={vi.fn()} />);
  fireEvent.change(screen.getByPlaceholderText("Ex.: Boas-vindas no WhatsApp"), {
    target: { value: "Inscrição" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Próximo/, hidden: true }));
  fireEvent.click(screen.getByRole("button", { name: /Próximo/, hidden: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.create.mockResolvedValue({ id: "a1", number: 7 });
});
afterEach(() => cleanup());

describe("NewAutomationModal — continuar se o consultor responder", () => {
  it("desligado por padrão e enviado como false", async () => {
    openStep3();
    const sw = screen.getByRole("switch", { name: "Continuar mesmo se o consultor responder", hidden: true });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: /Criar e abrir builder/, hidden: true }));
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(h.create.mock.calls[0]![0]).toMatchObject({ keepRunningOnAgentReply: false });
  });

  it("ligado: aparece no resumo e vai no POST", async () => {
    openStep3();
    fireEvent.click(screen.getByRole("switch", { name: "Continuar mesmo se o consultor responder", hidden: true }));
    expect(screen.getByText("Continua se o consultor responder").nextSibling?.textContent).toBe("Sim");
    fireEvent.click(screen.getByRole("button", { name: /Criar e abrir builder/, hidden: true }));
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(h.create.mock.calls[0]![0]).toMatchObject({
      name: "Inscrição",
      keepRunningOnAgentReply: true,
      allowManualRun: false,
    });
  });
});
