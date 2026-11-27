/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/crm/dropdown-glass", () => ({
  DropdownGlass: ({ placeholder }: { placeholder?: string }) => (
    <div data-testid="dropdown">{placeholder}</div>
  ),
}));

import { CampaignTemplateVariableMapper } from "@/features/campaigns/template-variable-mapper";
import type { CampaignTemplateComponentsPayload, TemplateRow } from "@/features/campaigns/types";

const BLACK_GERAL: TemplateRow = {
  name: "black_geral",
  language: "pt_BR",
  status: "APPROVED",
  bodyPreview: "Black Friday chegou!",
  headerFormat: "IMAGE",
  headerExampleUrl: "https://scontent.whatsapp.net/v/t61/black.jpg",
};

function renderMapper(onChange: (p: CampaignTemplateComponentsPayload | null) => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => [] })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CampaignTemplateVariableMapper template={BLACK_GERAL} onChange={onChange} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("campanha × cabeçalho de mídia", () => {
  it("por padrão usa a mídia original do template, sem exigir campo", async () => {
    const onChange = vi.fn();
    renderMapper(onChange);
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({
        version: 1,
        headerMediaSource: "template",
        headerMediaType: "image",
        headerMediaExampleUrl: "https://scontent.whatsapp.net/v/t61/black.jpg",
      }),
    );
    expect(screen.queryByText("Selecione o campo com a URL da imagem.")).toBeNull();
    expect(screen.queryByTestId("dropdown")).toBeNull();
    expect(screen.getByAltText("Mídia original do template")).toBeTruthy();
  });

  it("opção 'Campo do negócio' volta a pedir o custom field", async () => {
    const onChange = vi.fn();
    renderMapper(onChange);
    fireEvent.click(screen.getByRole("radio", { name: /Campo do negócio/ }));
    expect(await screen.findByTestId("dropdown")).toBeTruthy();
    expect(screen.getByText("Selecione o campo com a URL da imagem.")).toBeTruthy();
    // Sem campo escolhido não vai payload de mídia (o botão "Criar" segue bloqueado).
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith({ version: 1 }));
  });
});
