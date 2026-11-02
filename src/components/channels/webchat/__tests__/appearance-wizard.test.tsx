/** @vitest-environment jsdom */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/channels/channel-pipeline-select", () => ({
  ChannelPipelineSelect: () => null,
}));

import { WebchatConfigPanel } from "../../webchat-config-panel";
import type { ApiChannel } from "../../types";
import {
  appearanceProblems,
  appearanceSaveBody,
  emptyAppearance,
  moved,
  prepareAppearanceForSave,
  previewAppearance,
  withModel,
} from "../appearance-config";
import { readWebchatV2Config } from "../v2-config";
import type { WebchatAppearance } from "@/features/webchat-widget/appearance";

const KEY = "wc_abcdefghijklmnopqrstuvwx";
const channel: ApiChannel = {
  id: "ch-wc",
  name: "Site",
  type: "WEBCHAT",
  provider: "WEBCHAT",
  status: "CONNECTED",
  config: {
    publicKey: KEY,
    identification: "name",
    allowedOrigins: ["https://a.test"],
    theme: { primary: null, title: "Loja", avatarUrl: null, position: "left" },
    v2: {
      context: { labels: { pagina: "Página" }, maxKeys: 12 },
      refDealCustomFieldId: "cf_1",
    },
  },
  phoneNumber: null,
  lastConnectedAt: null,
  qrCode: null,
  sessionData: null,
  defaultPipelineId: "pipe_1",
  createdAt: "2026-10-17T00:00:00.000Z",
  updatedAt: "2026-10-17T00:00:00.000Z",
  organizationSlug: "acme",
  publicKey: KEY,
};

const SAVED: WebchatAppearance = {
  model: "guided",
  allowExpand: false,
  start: {
    title: "Título salvo",
    topics: [
      { id: "t1", label: "Primeiro", icon: "lock", action: { type: "write" } },
      { id: "t2", label: "Segundo", icon: "file", action: { type: "send_text", text: "Oi" } },
    ],
  },
  contextBanner: { enabled: false },
  closing: { enabled: false },
};

describe("regras do rascunho", () => {
  it("só o modelo com apoio nasce com expandir", () => {
    const a = emptyAppearance();
    expect(a.model).toBe("compact");
    expect(withModel(a, "assisted").allowExpand).toBe(true);
    expect(withModel(withModel(a, "assisted"), "guided").allowExpand).toBe(false);
  });

  it("reordenar respeita as pontas", () => {
    expect(moved([1, 2, 3], 2, -1)).toEqual([1, 3, 2]);
    const list = [1, 2];
    expect(moved(list, 0, -1)).toBe(list);
    expect(moved(list, 1, 1)).toBe(list);
  });

  it("avisos apontam o passo certo e não bloqueiam nada sozinhos", () => {
    const problems = appearanceProblems({
      ...emptyAppearance(),
      start: {
        topics: [
          { id: "a", label: "", icon: "chat", action: { type: "open_url", url: "http://x.test" } },
          {
            id: "b",
            label: "B",
            icon: "chat",
            action: { type: "write" },
            followUp: {
              question: " ",
              options: [{ id: "o", label: "", action: { type: "open_url", url: "x" } }],
            },
          },
        ],
      },
      contextBanner: { enabled: true, titleKey: "com espaço" },
      closing: { enabled: true },
    });
    expect(problems.map((p) => p.step)).toEqual([1, 1, 2, 2, 2, 3, 3]);
    expect(appearanceProblems(emptyAppearance())).toEqual([]);
  });

  it("no PUT: campo limpo vai como null (ausente manteria o gravado) e mensagem vazia usa o título", () => {
    const body = prepareAppearanceForSave({
      ...emptyAppearance(),
      start: {
        title: "  ",
        topics: [
          { id: "a", label: " Rótulo ", icon: "chat", action: { type: "send_text", text: " " } },
          { id: "b", label: "L", icon: "chat", action: { type: "open_url", url: " https://x.test ", label: " " } },
        ],
      },
    });
    expect(body.start.title).toBeNull();
    expect(body.contextBanner.titleKey).toBeNull();
    expect(body.closing.resolvedLabel).toBeNull();
    expect(body.start.topics[0]).toMatchObject({
      label: "Rótulo",
      action: { type: "send_text", text: "Rótulo" },
    });
    expect(body.start.topics[1]?.action).toEqual({ type: "open_url", url: "https://x.test" });
  });

  it("preserva o resto da config e o v2 gravado, só troca o appearance", () => {
    const body = appearanceSaveBody(channel, SAVED);
    expect(body.name).toBe("Site");
    expect(body.defaultPipelineId).toBe("pipe_1");
    expect(body.config).toMatchObject({
      publicKey: KEY,
      identification: "name",
      allowedOrigins: ["https://a.test"],
      theme: { primary: null, position: "left" },
    });
    expect(body.config.v2).toMatchObject({
      context: { labels: { pagina: "Página" }, maxKeys: 12 },
      refDealCustomFieldId: "cf_1",
      appearance: { model: "guided" },
    });
  });

  it("prévia mantém o que ainda está incompleto sem link quebrado", () => {
    const preview = previewAppearance({
      ...emptyAppearance(),
      start: {
        topics: [
          { id: "a", label: "", icon: "chat", action: { type: "open_url", url: "em digitação" } },
        ],
      },
    });
    expect(preview.start.topics[0]).toMatchObject({
      label: "Sem título",
      action: { type: "write" },
    });
  });

  it("o painel lê e devolve o appearance gravado", () => {
    const config = { ...(channel.config as object), v2: { appearance: SAVED } };
    expect(readWebchatV2Config(config).appearance?.start.topics).toHaveLength(2);
    expect("appearance" in readWebchatV2Config(channel.config)).toBe(false);
  });
});

describe("wizard no painel", () => {
  const fetchMock = vi.fn();
  const showModal = HTMLDialogElement.prototype.showModal;

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    HTMLDialogElement.prototype.showModal = function () {
      this.setAttribute("open", "");
    };
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
      fn(0);
      return 0;
    });
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    HTMLDialogElement.prototype.showModal = showModal;
  });

  function renderPanel(ch: ApiChannel = channel) {
    const onSaved = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <WebchatConfigPanel channel={ch} onSaved={onSaved} />
      </QueryClientProvider>,
    );
    return onSaved;
  }

  async function openWizard() {
    fireEvent.click(screen.getByRole("button", { name: "Configurar modelo" }));
    const title = await screen.findByRole("heading", { name: "Modelo do widget" });
    return within(title.closest("dialog") as HTMLElement);
  }

  const puts = () =>
    fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === "PUT")
      .map(([, init]) => JSON.parse((init as RequestInit).body as string));

  it("canal sem configuração: nada muda até abrir, e o recomendado é indicado", async () => {
    renderPanel();
    expect(screen.getByText(/Nenhum modelo configurado/)).toBeTruthy();
    const w = await openWizard();
    expect(w.getByRole("radio", { name: /Compacto/ })).toHaveProperty("checked", true);
    expect(w.getByRole("radio", { name: /Com apoio.*Recomendado/ })).toBeTruthy();
    expect(puts()).toHaveLength(0);
  });

  it("fechar sem salvar não grava nem muda o que reabre", async () => {
    renderPanel();
    let w = await openWizard();
    fireEvent.click(w.getByRole("radio", { name: /Início guiado/ }));
    fireEvent.click(w.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Modelo do widget" })).toBeNull());
    expect(puts()).toHaveLength(0);
    w = await openWizard();
    expect(w.getByRole("radio", { name: /Compacto/ })).toHaveProperty("checked", true);
  });

  it("percorre os passos, mostra a prévia ao vivo e salva só o appearance", async () => {
    const onSaved = renderPanel();
    const w = await openWizard();
    const preview = () => within(w.getByRole("complementary", { name: "Prévia do widget" }));

    fireEvent.click(w.getByRole("radio", { name: /Com apoio/ }));
    expect(w.getByRole("switch", { name: "Permitir expandir o painel" }).getAttribute("aria-checked")).toBe("true");

    fireEvent.click(w.getByRole("button", { name: "Próximo" }));
    expect(w.getByRole("heading", { name: "Tópicos e botões" })).toBeTruthy();
    fireEvent.change(w.getByLabelText("Pergunta inicial"), { target: { value: "Qual etapa?" } });
    expect(preview().getByText("Qual etapa?")).toBeTruthy();

    fireEvent.click(w.getByRole("button", { name: "Adicionar tópico" }));
    fireEvent.change(w.getByLabelText("Título"), { target: { value: "Tópico A" } });
    expect(preview().getByRole("button", { name: "Tópico A" })).toBeTruthy();

    fireEvent.click(w.getByRole("button", { name: "Próximo" }));
    fireEvent.click(w.getByRole("switch", { name: "Tópico A" }));
    fireEvent.change(w.getByLabelText("Pergunta"), { target: { value: "Pergunta A" } });
    fireEvent.change(w.getByLabelText("Título"), { target: { value: "Tutorial" } });
    fireEvent.change(w.getByLabelText("Ao clicar"), { target: { value: "open_url" } });
    fireEvent.change(w.getByLabelText("Link (https)"), { target: { value: "https://x.test/t" } });

    fireEvent.click(w.getByRole("button", { name: "Próximo" }));
    fireEvent.click(w.getByRole("switch", { name: "Mostrar a faixa de contexto" }));
    fireEvent.change(w.getByLabelText("Chave do título"), { target: { value: "pagina" } });
    expect(preview().getByText("Valor de pagina")).toBeTruthy();
    fireEvent.click(w.getByRole("switch", { name: "Mostrar botões de encerramento" }));
    fireEvent.change(w.getByLabelText("Botão de resolvido"), { target: { value: "Pronto" } });

    fireEvent.click(w.getByRole("button", { name: "Próximo" }));
    expect(w.queryByText("Vale conferir antes de salvar")).toBeNull();
    fireEvent.click(w.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(puts()).toHaveLength(1));
    const [body] = puts();
    expect(body.config.publicKey).toBe(KEY);
    expect(body.config.identification).toBe("name");
    expect(body.config.v2.context.labels).toEqual({ pagina: "Página" });
    expect(body.config.v2.appearance).toMatchObject({
      model: "assisted",
      allowExpand: true,
      start: {
        title: "Qual etapa?",
        topics: [
          {
            label: "Tópico A",
            action: { type: "send_text", text: "Tópico A" },
            followUp: {
              question: "Pergunta A",
              options: [{ label: "Tutorial", action: { type: "open_url", url: "https://x.test/t" } }],
            },
          },
        ],
      },
      contextBanner: { enabled: true, titleKey: "pagina" },
      closing: { enabled: true, resolvedLabel: "Pronto" },
    });

    // Fecha só o wizard: o painel continua aberto e já mostra o modelo novo.
    await waitFor(() => expect(screen.getByText("Com apoio com 1 tópico.")).toBeTruthy());
    expect(onSaved).not.toHaveBeenCalled();

    // O "Salvar" do painel não apaga o que o wizard gravou.
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(puts()[1].config.v2.appearance.model).toBe("assisted");
  });

  it("adiciona, reordena e remove tópicos; para em 6", async () => {
    renderPanel({
      ...channel,
      config: { ...(channel.config as object), v2: { appearance: SAVED } },
    });
    const w = await openWizard();
    fireEvent.click(w.getByRole("button", { name: "Próximo" }));
    const titles = () => w.getAllByLabelText("Título").map((i) => (i as HTMLInputElement).value);
    expect(titles()).toEqual(["Primeiro", "Segundo"]);

    fireEvent.click(w.getByRole("button", { name: "Mover Segundo para cima" }));
    expect(titles()).toEqual(["Segundo", "Primeiro"]);

    
    const add = w.getByRole("button", { name: "Adicionar tópico" });
    fireEvent.click(w.getByRole("button", { name: "Remover Primeiro" }));
    expect(titles()).toEqual(["Segundo"]);
    expect(document.activeElement).toBe(add);

    for (let i = 0; i < 5; i++) fireEvent.click(add);
    expect(titles()).toHaveLength(6);
    expect(add).toHaveProperty("disabled", true);
  });

  it("revisão aponta o que falta e leva ao passo; erro do backend aparece e não fecha", async () => {
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ message: "Recusado pelo servidor." }), { status: 400 }),
    );
    renderPanel();
    const w = await openWizard();
    fireEvent.click(w.getByRole("button", { name: "2. Tópicos e botões" }));
    fireEvent.click(w.getByRole("button", { name: "Adicionar tópico" }));
    fireEvent.click(w.getByRole("button", { name: "5. Revisar e salvar" }));
    expect(w.getByText("Vale conferir antes de salvar")).toBeTruthy();

    // O aviso orienta; quem decide é o backend.
    fireEvent.click(w.getByRole("button", { name: "Salvar" }));
    expect((await w.findByRole("alert")).textContent).toBe("Recusado pelo servidor.");
    expect(screen.getByRole("heading", { name: "Modelo do widget" })).toBeTruthy();

    fireEvent.click(w.getByRole("button", { name: /Ir para Tópicos e botões/ }));
    expect(w.getByRole("heading", { name: "Tópicos e botões" })).toBeTruthy();
    expect(document.activeElement).toBe(w.getByRole("heading", { name: "Tópicos e botões" }));
  });
});
