/** @vitest-environment jsdom */
/** Botão de anexo com destino próprio (grupos WhatsApp): não usa a conversa do inbox. */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  send: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/features/inbox-v2/hooks", () => ({
  useSendAttachment: () => ({ mutateAsync: h.send, mutate: h.send, isPending: false }),
}));

import { FilePickerButton } from "../file-picker-button";

afterEach(cleanup);

function pick(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("FilePickerButton com sendFile", () => {
  it("fica habilitado sem conversa e envia para o destino próprio", async () => {
    const sendFile = vi.fn().mockResolvedValue({ ok: true });
    const { container, getByRole } = render(
      <FilePickerButton conversationId={null} sendFile={sendFile}>
        anexar
      </FilePickerButton>,
    );
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    const file = new File(["%PDF"], "proposta.pdf", { type: "application/pdf" });
    pick(container, file);
    await waitFor(() => expect(sendFile).toHaveBeenCalledWith(file, "proposta.pdf"));
    expect(h.send).not.toHaveBeenCalled();
  });

  it("falha no envio mostra o erro", async () => {
    const sendFile = vi.fn().mockRejectedValue(new Error("Arquivo muito grande (máx 16 MB)."));
    const { container } = render(
      <FilePickerButton conversationId={null} sendFile={sendFile}>
        anexar
      </FilePickerButton>,
    );
    pick(container, new File(["x"], "a.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(h.toast.error).toHaveBeenCalledWith("Arquivo muito grande (máx 16 MB)."));
  });

  it("sem sendFile e sem conversa continua desabilitado (inbox inalterado)", () => {
    const { getByRole } = render(<FilePickerButton conversationId={null}>anexar</FilePickerButton>);
    expect((getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
