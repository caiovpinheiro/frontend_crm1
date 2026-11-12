/** @vitest-environment jsdom */
/**
 * Nota de voz do Composer: o envio usa o canal escolhido em "Enviar por"
 * (como texto e anexos) e, se o envio falhar, o áudio gravado volta para a
 * prévia em vez de sumir.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
  send: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/features/inbox-v2/hooks", () => ({
  useSendAttachment: () => ({ mutateAsync: h.send, mutate: h.send, isPending: false }),
}));
vi.mock("@/lib/native/permissions", () => ({
  openMicrophoneStream: async () => ({
    ok: true,
    stream: { getTracks: () => [{ stop: vi.fn() }] },
  }),
}));

class FakeRecorder {
  static isTypeSupported = () => true;
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {}
  requestData() {}
  stop() {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(4096)], { type: "audio/ogg" }) });
    this.onstop?.();
  }
}

import { TooltipProvider } from "@/components/ui/tooltip";

import { AudioRecorderButton } from "../audio-recorder-button";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("MediaRecorder", FakeRecorder);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn() },
  });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function recordAndStop(channelId: string | null = "canal-cliente") {
  render(
    <TooltipProvider>
      <AudioRecorderButton conversationId="conv-1" channelId={channelId} />
    </TooltipProvider>,
  );
  fireEvent.click(screen.getAllByRole("button")[0]!);
  fireEvent.click(await screen.findByRole("button", { name: "Parar gravação" }));
  return screen.findByRole("button", { name: "Enviar áudio" });
}

describe("AudioRecorderButton", () => {
  it("envia pelo canal escolhido em 'Enviar por'", async () => {
    h.send.mockResolvedValue({ message: { id: "m1" } });
    fireEvent.click(await recordAndStop("canal-cliente"));
    await waitFor(() => expect(h.send).toHaveBeenCalled());
    expect(h.send.mock.calls[0]![0]).toMatchObject({ channelId: "canal-cliente" });
  });

  it("envio que falha: mostra o erro e o áudio volta para a prévia", async () => {
    h.send.mockRejectedValue(new Error("Sessão de 24h encerrada neste canal. Envie um template."));
    fireEvent.click(await recordAndStop());
    await waitFor(() =>
      expect(h.toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Sessão de 24h encerrada"),
      ),
    );
    expect(await screen.findByRole("button", { name: "Enviar áudio" })).toBeTruthy();
  });

  it("envio com sucesso: limpa a prévia", async () => {
    h.send.mockResolvedValue({ message: { id: "m1" } });
    fireEvent.click(await recordAndStop());
    await waitFor(() => expect(screen.queryByRole("button", { name: "Enviar áudio" })).toBeNull());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Parar gravação" })).toBeNull();
  });
});

describe("AudioRecorderButton com destino próprio (grupos WhatsApp)", () => {
  it("envia para sendFile, sem conversa do inbox", async () => {
    const sendFile = vi.fn().mockResolvedValue({ ok: true });
    render(
      <TooltipProvider>
        <AudioRecorderButton conversationId={null} sendFile={sendFile} />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getAllByRole("button")[0]!);
    fireEvent.click(await screen.findByRole("button", { name: "Parar gravação" }));
    fireEvent.click(await screen.findByRole("button", { name: "Enviar áudio" }));
    await waitFor(() => expect(sendFile).toHaveBeenCalled());
    expect(sendFile.mock.calls[0]![1]).toMatch(/^audio-\d+\./);
    expect(h.send).not.toHaveBeenCalled();
  });
});
