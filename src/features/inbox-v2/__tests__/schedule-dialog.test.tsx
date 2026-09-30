/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  createScheduledMessage: vi.fn(),
  uploadAutomationMedia: vi.fn(),
  listScheduledMessages: vi.fn(),
  cancelScheduledMessage: vi.fn(),
}));
vi.mock("@/features/inbox-v2/api", () => api);

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("sonner", () => ({ toast }));

// Picker real é um <dialog> Radix com fetch de templates — aqui vira um
// botão que devolve um template fixo pelo mesmo contrato (`onPick`).
vi.mock("@/features/inbox-v2/extras/template-picker-popover", () => ({
  WhatsappTemplatePickerModal: (props: {
    open: boolean;
    onClose: () => void;
    onPick?: (tpl: unknown) => void;
  }) =>
    props.open ? (
      <button
        type="button"
        onClick={() => {
          props.onPick?.({
            id: "t1",
            name: "Boas-vindas",
            metaTemplateName: "boas_vindas",
            language: "pt_BR",
          });
          props.onClose();
        }}
      >
        picker-stub
      </button>
    ) : null,
}));

import {
  ScheduleDialog,
  validateScheduleForm,
} from "@/features/inbox-v2/extras/schedule-dialog";

const FUTURE = "2099-01-01T10:00";
const FUTURE_ISO = new Date(FUTURE).toISOString();

function renderDialog(
  props: Partial<ComponentProps<typeof ScheduleDialog>> = {},
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ScheduleDialog
        open
        conversationId="conv-1"
        channelId="ch-1"
        onClose={onClose}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onClose };
}

function fillBasics(content = "Olá") {
  fireEvent.change(screen.getByLabelText("Mensagem"), {
    target: { value: content },
  });
  fireEvent.change(screen.getByLabelText("Enviar em"), {
    target: { value: FUTURE },
  });
}

function submitButton() {
  return screen.getByRole("button", { name: "Agendar" }) as HTMLButtonElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("validateScheduleForm", () => {
  const base = {
    content: "oi",
    scheduledAt: FUTURE,
    hasAttachment: false,
    useFallback: false,
    fallbackTemplate: null,
    now: Date.parse("2026-09-30T12:00:00Z"),
  };

  it("exige conteúdo ou anexo", () => {
    expect(validateScheduleForm({ ...base, content: "  " })).toEqual({
      ok: false,
      error: "Informe um conteúdo ou anexo",
    });
    expect(
      validateScheduleForm({ ...base, content: "", hasAttachment: true }).ok,
    ).toBe(true);
  });

  it("rejeita data vazia, inválida ou no passado", () => {
    expect(validateScheduleForm({ ...base, scheduledAt: "" }).ok).toBe(false);
    expect(validateScheduleForm({ ...base, scheduledAt: "abc" }).ok).toBe(false);
    expect(
      validateScheduleForm({ ...base, scheduledAt: "2000-01-01T10:00" }),
    ).toEqual({ ok: false, error: "A data precisa ser no futuro" });
  });

  it("com fallback ligado, exige template escolhido", () => {
    expect(validateScheduleForm({ ...base, useFallback: true })).toEqual({
      ok: false,
      error: "Escolha o template fallback",
    });
    const ok = validateScheduleForm({
      ...base,
      useFallback: true,
      fallbackTemplate: { name: "x", language: "pt_BR" },
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.when.toISOString()).toBe(FUTURE_ISO);
  });
});

describe("ScheduleDialog", () => {
  it("não renderiza nada fechado", () => {
    renderDialog({ open: false });
    expect(screen.queryByRole("form", { name: "Agendar mensagem" })).toBeNull();
  });

  it("agenda só texto: POST sem media nem fallbackTemplate, fecha e invalida", async () => {
    api.createScheduledMessage.mockResolvedValue({ id: "s1" });
    const { onClose } = renderDialog();

    expect(submitButton().disabled).toBe(true);
    fillBasics("Bom dia!");
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(submitButton());

    await waitFor(() => expect(api.createScheduledMessage).toHaveBeenCalledTimes(1));
    expect(api.createScheduledMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      content: "Bom dia!",
      scheduledAt: FUTURE_ISO,
    });
    expect(api.uploadAutomationMedia).not.toHaveBeenCalled();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(toast.success).toHaveBeenCalledWith("Mensagem agendada");
  });

  it("agenda só anexo: faz upload antes e manda `media`", async () => {
    api.uploadAutomationMedia.mockResolvedValue({
      url: "https://cdn.example/foto.png",
      fileName: "foto.png",
      mimeType: "image/png",
    });
    api.createScheduledMessage.mockResolvedValue({ id: "s2" });
    renderDialog();

    const file = new File(["abc"], "foto.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Arquivo do anexo"), {
      target: { files: [file] },
    });
    expect(screen.getByText("foto.png")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Trocar anexo/ })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Enviar em"), {
      target: { value: FUTURE },
    });
    expect(submitButton().disabled).toBe(false);
    fireEvent.click(submitButton());

    await waitFor(() => expect(api.createScheduledMessage).toHaveBeenCalledTimes(1));
    expect(api.uploadAutomationMedia).toHaveBeenCalledWith(file);
    expect(api.createScheduledMessage).toHaveBeenCalledWith({
      conversationId: "conv-1",
      content: "",
      scheduledAt: FUTURE_ISO,
      media: {
        url: "https://cdn.example/foto.png",
        type: "image/png",
        name: "foto.png",
      },
    });
  });

  it("recusa anexo acima de 16 MB", () => {
    renderDialog();
    const big = new File(["x"], "big.bin");
    Object.defineProperty(big, "size", { value: 17 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Arquivo do anexo"), {
      target: { files: [big] },
    });
    expect(toast.warning).toHaveBeenCalledWith("O arquivo excede o limite de 16 MB.");
    expect(screen.queryByText("big.bin")).toBeNull();
  });

  it("fallback ligado exige template; escolhido, vai no payload", async () => {
    api.createScheduledMessage.mockResolvedValue({ id: "s3" });
    renderDialog();
    fillBasics();

    fireEvent.click(screen.getByLabelText(/Usar template fallback/));
    expect(submitButton().disabled).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: /Escolher template fallback/ }),
    );
    fireEvent.click(screen.getByText("picker-stub"));
    expect(screen.getByText("Boas-vindas")).toBeTruthy();
    expect(submitButton().disabled).toBe(false);

    fireEvent.click(submitButton());
    await waitFor(() => expect(api.createScheduledMessage).toHaveBeenCalledTimes(1));
    expect(api.createScheduledMessage.mock.calls[0][0]).toMatchObject({
      fallbackTemplate: { name: "boas_vindas", language: "pt_BR" },
    });
  });

  it("desligar o fallback descarta o template escolhido", () => {
    renderDialog();
    fillBasics();
    const toggle = screen.getByLabelText(/Usar template fallback/);
    fireEvent.click(toggle);
    fireEvent.click(
      screen.getByRole("button", { name: /Escolher template fallback/ }),
    );
    fireEvent.click(screen.getByText("picker-stub"));
    expect(screen.getByText("Boas-vindas")).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText("Boas-vindas")).toBeNull();
    expect(submitButton().disabled).toBe(false);
  });

  it("canal Baileys (allowTemplateFallback=false) não oferece fallback", () => {
    renderDialog({ allowTemplateFallback: false });
    expect(screen.queryByLabelText(/Usar template fallback/)).toBeNull();
    expect(screen.getByLabelText("Mensagem")).toBeTruthy();
  });

  it("data no passado: erro em toast, sem POST e sem fechar", async () => {
    const { onClose } = renderDialog();
    fireEvent.change(screen.getByLabelText("Mensagem"), {
      target: { value: "oi" },
    });
    fireEvent.change(screen.getByLabelText("Enviar em"), {
      target: { value: "2000-01-01T10:00" },
    });
    fireEvent.click(submitButton());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("A data precisa ser no futuro"),
    );
    expect(api.createScheduledMessage).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falha do backend vira toast de erro e mantém o diálogo", async () => {
    api.createScheduledMessage.mockRejectedValue(new Error("Sem permissão"));
    const { onClose } = renderDialog();
    fillBasics();
    fireEvent.click(submitButton());

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sem permissão"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
