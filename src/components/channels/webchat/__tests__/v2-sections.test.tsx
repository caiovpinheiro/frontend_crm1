/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/channels/channel-pipeline-select", () => ({
  ChannelPipelineSelect: () => null,
}));

import { WebchatConfigPanel } from "../../webchat-config-panel";
import type { ApiChannel } from "../../types";
import { WebchatSecretField } from "../secret-field";
import {
  defaultWebchatV2Config,
  prepareWebchatV2ForSave,
  readWebchatSecretsStatus,
  readWebchatV2Config,
} from "../v2-config";

const channel: ApiChannel = {
  id: "ch-wc",
  name: "Site",
  type: "WEBCHAT",
  provider: "WEBCHAT",
  status: "CONNECTED",
  config: {
    publicKey: "wc_abcdefghijklmnopqrstuvwx",
    identification: "none",
    v2: { context: { labels: { etapa: "Etapa" }, maxKeys: 10 } },
  },
  phoneNumber: null,
  lastConnectedAt: null,
  qrCode: null,
  sessionData: null,
  defaultPipelineId: null,
  createdAt: "2026-10-28T00:00:00.000Z",
  updatedAt: "2026-10-28T00:00:00.000Z",
  organizationSlug: "acme",
  publicKey: "wc_abcdefghijklmnopqrstuvwx",
  webchatSecrets: {
    identity: { configured: true, rotatedAt: "2026-10-28T12:00:00.000Z" },
    s2s: { configured: false, rotatedAt: null },
  },
};

function wrap(ui: React.ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

describe("v2-config (painel)", () => {
  it("lê o v2 gravado com tolerância e completa com defaults", () => {
    const v2 = readWebchatV2Config(channel.config);
    expect(v2.context.labels).toEqual({ etapa: "Etapa" });
    expect(v2.context.maxKeys).toBe(10);
    expect(v2.context.maxValueChars).toBe(200);
    expect(v2.identity.matchField).toEqual({ type: "externalId" });
    expect(readWebchatV2Config(null)).toEqual(defaultWebchatV2Config());
    expect(readWebchatV2Config({ v2: { context: { maxKeys: 5000 } } }).context.maxKeys).toBe(100);
  });

  it("status das chaves: só sim/não + data", () => {
    expect(readWebchatSecretsStatus(channel.webchatSecrets)).toEqual({
      identity: { configured: true, rotatedAt: "2026-10-28T12:00:00.000Z" },
      s2s: { configured: false, rotatedAt: null },
    });
    expect(readWebchatSecretsStatus(undefined).identity.configured).toBe(false);
  });

  it("antes de salvar descarta linhas incompletas", () => {
    const v2 = defaultWebchatV2Config();
    v2.identity.attributeMap = [
      { attribute: "plano", customFieldId: "cf1" },
      { attribute: "", customFieldId: "cf2" },
      { attribute: "x", customFieldId: "" },
    ];
    v2.s2s.rules = [{ priority: "alta", pinNote: true }, { category: "a" }, { tagId: "t1" }];
    v2.context.labels = { ok: "Ok", vazio: " " };
    const out = prepareWebchatV2ForSave(v2);
    expect(out.identity.attributeMap).toEqual([{ attribute: "plano", customFieldId: "cf1" }]);
    expect(out.s2s.rules).toEqual([{ priority: "alta", pinNote: true }]);
    expect(out.context.labels).toEqual({ ok: "Ok" });
  });
});

describe("WebchatSecretField", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("gera e mostra o valor uma vez; girar pede confirmação", async () => {
    const onRotated = vi.fn();
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: "s2s",
          secret: "wcsk_valor-de-teste",
          rotatedAt: "2026-10-28T13:00:00.000Z",
          secrets: {
            identity: { configured: false, rotatedAt: null },
            s2s: { configured: true, rotatedAt: "2026-10-28T13:00:00.000Z" },
          },
        }),
        { status: 201 },
      ),
    );
    const { rerender } = wrap(
      <WebchatSecretField
        channelId="ch-wc"
        kind="s2s"
        label="Chave servidor a servidor"
        status={{ configured: false, rotatedAt: null }}
        onRotated={onRotated}
      />,
    );
    expect(screen.getByText("Não configurada")).toBeTruthy();
    fireEvent.click(screen.getByText("Gerar chave"));
    await waitFor(() => expect(screen.getByDisplayValue("wcsk_valor-de-teste")).toBeTruthy());
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/channels/ch-wc/webchat-secrets/s2s");
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    expect(onRotated).toHaveBeenCalledWith(
      expect.objectContaining({ s2s: { configured: true, rotatedAt: "2026-10-28T13:00:00.000Z" } }),
    );

    // "Já copiei" esconde o valor para sempre (não há como ler de novo).
    fireEvent.click(screen.getByText("Já copiei"));
    expect(screen.queryByDisplayValue("wcsk_valor-de-teste")).toBeNull();

    // Configurada: o primeiro clique só pede confirmação.
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <WebchatSecretField
          channelId="ch-wc"
          kind="s2s"
          label="Chave servidor a servidor"
          status={{ configured: true, rotatedAt: "2026-10-28T13:00:00.000Z" }}
          onRotated={onRotated}
        />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByText("Gerar nova chave"));
    expect(screen.getByRole("alert").textContent).toMatch(/deixa de valer/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("WebchatConfigPanel com v2", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes("/api/channels/ch-wc")) return new Response(JSON.stringify({ channel }), { status: 200 });
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("mostra as três seções e manda v2 no PUT sem segredo", async () => {
    const onSaved = vi.fn();
    wrap(<WebchatConfigPanel channel={channel} onSaved={onSaved} />);
    expect(screen.getByText("Identificação pelo site")).toBeTruthy();
    expect(screen.getByText("Contexto do site")).toBeTruthy();
    expect(screen.getByText("Servidor a servidor")).toBeTruthy();
    expect(
      (screen.getByLabelText("Endereço de entrada (POST)") as HTMLInputElement).value,
    ).toMatch(/\/api\/public\/webchat\/s2s\/wc_abcdefghijklmnopqrstuvwx$/);

    fireEvent.click(screen.getByLabelText("Aceitar contexto de visitante não identificado"));
    fireEvent.change(screen.getByLabelText("Eventos importantes (viram nota na conversa)"), {
      target: { value: "erro_pagamento" },
    });
    fireEvent.click(screen.getByText("Evento"));
    fireEvent.click(screen.getByText("Salvar"));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls.find(
      ([u, i]) => String(u).includes("/api/channels/ch-wc") && i?.method === "PUT",
    )!;
    const body = JSON.parse(init.body as string);
    expect(body.config.v2.context).toMatchObject({ anonymous: true, labels: { etapa: "Etapa" }, maxKeys: 10 });
    expect(body.config.v2.events.important).toEqual(["erro_pagamento"]);
    expect(JSON.stringify(body)).not.toMatch(/identitySecret|s2sSecret/);
  });
});
