/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/channels/channel-pipeline-select", () => ({
  ChannelPipelineSelect: () => null,
}));

import { WebchatConfigPanel, webchatSnippet } from "../webchat-config-panel";
import type { ApiChannel } from "../types";

const channel: ApiChannel = {
  id: "ch-wc",
  name: "Site",
  type: "WEBCHAT",
  provider: "WEBCHAT",
  status: "CONNECTED",
  config: { publicKey: "wc_abcdefghijklmnopqrstuvwx", identification: "none" },
  phoneNumber: null,
  lastConnectedAt: null,
  qrCode: null,
  sessionData: null,
  defaultPipelineId: null,
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
  organizationSlug: "acme",
  publicKey: "wc_abcdefghijklmnopqrstuvwx",
};

describe("WebchatConfigPanel", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ channel }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("snippet com data-key e embed versionado", () => {
    expect(webchatSnippet("wc_abc123456", "https://bwipo.com")).toBe(
      '<script async src="https://bwipo.com/webchat/embed.js?v=1" data-key="wc_abc123456"></script>',
    );
  });

  it("salva allowedOrigins/aparência via PUT mantendo a publicKey", async () => {
    const onSaved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WebchatConfigPanel channel={channel} onSaved={onSaved} />
      </QueryClientProvider>,
    );

    expect(
      (screen.getByDisplayValue(/data-key="wc_abcdefghijklmnopqrstuvwx"/) as HTMLInputElement)
        .value,
    ).toContain("/webchat/embed.js?v=1");

    const origin = screen.getByLabelText("Origem do site");
    fireEvent.change(origin, { target: { value: "not a url" } });
    fireEvent.click(screen.getByText("Adicionar"));
    expect(screen.getByRole("alert").textContent).toMatch(/origem válida/);

    fireEvent.change(origin, { target: { value: "https://WWW.Cliente.com.br/loja" } });
    fireEvent.click(screen.getByText("Adicionar"));
    expect(screen.getByText("https://www.cliente.com.br")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Título"), { target: { value: "Fale conosco" } });
    fireEvent.change(screen.getByLabelText("Pedir dados antes de conversar"), {
      target: { value: "name_email" },
    });
    fireEvent.click(screen.getByText("Salvar"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/channels/ch-wc"))!;
    expect(String(url)).toContain("/api/channels/ch-wc");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string);
    expect(body.config).toMatchObject({
      publicKey: "wc_abcdefghijklmnopqrstuvwx",
      allowedOrigins: ["https://www.cliente.com.br"],
      identification: "name_email",
      // Sem cor/avatar próprios no config: herda da organização (`null`).
      theme: { title: "Fale conosco", position: "right", primary: null, avatarUrl: null },
    });
  });

  function renderPanel(ch: ApiChannel) {
    const onSaved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WebchatConfigPanel channel={ch} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    return onSaved;
  }

  async function savedTheme(onSaved: ReturnType<typeof vi.fn>) {
    fireEvent.click(screen.getByText("Salvar"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).includes("/api/channels/ch-wc"))!;
    return JSON.parse(init.body as string).config.theme;
  }

  it("mostra a cor da organização e, ao personalizar, grava a cor própria", async () => {
    const onSaved = renderPanel({
      ...channel,
      webchatDefaults: { primary: "#AA3300", avatarUrl: "https://cdn.test/logo.png" },
    });
    expect(screen.getByText("#aa3300")).toBeTruthy();
    expect(screen.queryByLabelText("Cor principal (hex)")).toBeNull();

    fireEvent.click(screen.getByRole("switch", { name: "Usar cor da organização" }));
    const hex = screen.getByLabelText("Cor principal (hex)") as HTMLInputElement;
    expect(hex.value).toBe("#aa3300"); // parte da cor da organização
    fireEvent.change(hex, { target: { value: "#0f766e" } });

    expect(await savedTheme(onSaved)).toMatchObject({ primary: "#0f766e", avatarUrl: null });
  });

  it("canal com cor/avatar próprios abre com a herança desligada; religar volta a `null`", async () => {
    const onSaved = renderPanel({
      ...channel,
      config: {
        ...(channel.config as object),
        theme: { primary: "#123456", avatarUrl: "https://cdn.test/a.png", title: "X" },
      },
      webchatDefaults: { primary: "#aa3300", avatarUrl: null },
    });
    expect((screen.getByLabelText("Cor principal (hex)") as HTMLInputElement).value).toBe("#123456");
    expect(
      (screen.getByLabelText("Avatar (URL https da imagem)") as HTMLInputElement).value,
    ).toBe("https://cdn.test/a.png");

    fireEvent.click(screen.getByRole("switch", { name: "Usar logo da organização" }));
    expect(await savedTheme(onSaved)).toMatchObject({ primary: "#123456", avatarUrl: null });
  });

  it("backend sem `webchatDefaults`: só o rótulo 'cor da organização', sem quebrar", () => {
    renderPanel({ ...channel, webchatDefaults: undefined });
    expect(screen.getByText("Usar cor da organização")).toBeTruthy();
  });
});
