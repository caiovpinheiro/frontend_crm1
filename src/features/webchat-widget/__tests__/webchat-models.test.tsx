/** @vitest-environment jsdom */
/**
 * Os três modelos no `WebchatPanel`. Dados neutros: nenhum texto vem do
 * widget, tudo é config do canal.
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WebchatAppearance, WebchatTopic } from "../appearance";
import { normalizePublicConfig } from "../types";
import type { UiMessage } from "../use-webchat-chat";
import { WebchatPanel, type WebchatPanelProps } from "../webchat-panel";

const KEY = "wc_abcdefghijklmnopqrstuvwx";

const TOPIC_SEND: WebchatTopic = {
  id: "t1",
  label: "Tópico A",
  icon: "lock",
  action: { type: "send_text", text: "Texto do tópico A" },
  followUp: {
    question: "Pergunta do tópico A",
    hint: "Dica do tópico A",
    options: [
      { id: "o1", label: "Opção 1", action: { type: "send_text", text: "Texto da opção 1" } },
      {
        id: "o2",
        label: "Tutorial X",
        action: { type: "open_url", url: "https://x.test/tutorial", label: "Ver link" },
      },
    ],
  },
};
const TOPIC_URL: WebchatTopic = {
  id: "t2",
  label: "Tópico B",
  icon: "file",
  action: { type: "open_url", url: "https://x.test/b" },
};
const TOPIC_WRITE: WebchatTopic = { id: "t3", label: "Tópico C", icon: "chat", action: { type: "write" } };

function appearance(p: Partial<WebchatAppearance> = {}): WebchatAppearance {
  return {
    model: "compact",
    allowExpand: false,
    start: { topics: [TOPIC_SEND, TOPIC_URL, TOPIC_WRITE] },
    contextBanner: { enabled: false },
    closing: { enabled: false },
    ...p,
  };
}

/** Mensagens de verdade: o que o widget manda volta na lista, como no chat real. */
function Harness(props: Partial<WebchatPanelProps> & { onSendSpy?: (t: string) => void; a?: WebchatAppearance }) {
  const { a, onSendSpy, ...rest } = props;
  const [messages, setMessages] = useState<UiMessage[]>(props.messages ?? []);
  return (
    <WebchatPanel
      config={normalizePublicConfig(
        { theme: { title: "Loja" }, greeting: "Saudação do canal", appearance: a ?? appearance() },
        KEY,
      )}
      variant="embedded"
      view="chat"
      agentTyping={false}
      agentReadAt={null}
      onRetry={vi.fn()}
      onTyping={vi.fn()}
      onIdentify={vi.fn(async () => {})}
      onOfflineSubmit={vi.fn(async () => {})}
      onClose={vi.fn()}
      {...rest}
      messages={messages}
      onSend={(text) => {
        onSendSpy?.(text);
        setMessages((l) => [
          ...l,
          {
            id: `m${l.length}`,
            direction: "in",
            content: text,
            createdAt: new Date().toISOString(),
            status: "sent",
          },
        ]);
      }}
    />
  );
}

const logText = () => screen.getByRole("log").textContent ?? "";

describe("sem appearance", () => {
  afterEach(cleanup);

  it("widget igual: sem data-model, sem minimizar e sem separador", () => {
    render(
      <WebchatPanel
        config={normalizePublicConfig({ theme: { title: "Loja" } }, KEY)}
        variant="embedded"
        view="chat"
        messages={[]}
        agentTyping={false}
        agentReadAt={null}
        onClose={vi.fn()}
        onSend={vi.fn()}
        onRetry={vi.fn()}
        onTyping={vi.fn()}
        onIdentify={vi.fn(async () => {})}
        onOfflineSubmit={vi.fn(async () => {})}
      />,
    );
    expect(screen.getByRole("dialog").hasAttribute("data-model")).toBe(false);
    expect(screen.queryByRole("button", { name: "Minimizar chat" })).toBeNull();
    expect(screen.queryByText("Hoje")).toBeNull();
    expect(screen.getByRole("button", { name: "Fechar chat" })).toBeTruthy();
  });
});

describe("modelo compacto", () => {
  afterEach(cleanup);

  it("faixa com o contexto do site, separador e botões; sem valor a faixa some", () => {
    const a = appearance({
      contextBanner: { enabled: true, titleKey: "assunto", subtitleKey: "codigo" },
    });
    const { unmount } = render(<Harness a={a} siteContext={{ assunto: "Valor A", codigo: "Valor B" }} />);
    expect(screen.getByText("Valor A")).toBeTruthy();
    expect(screen.getByText("Valor B")).toBeTruthy();
    expect(screen.getByText("Hoje")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Minimizar chat" })).toBeTruthy();
    unmount();
    render(<Harness a={a} siteContext={{}} />);
    expect(screen.queryByText("Valor A")).toBeNull();
    expect(document.querySelector("[class*=contextBanner]")).toBeNull();
  });

  it("link em contorno abre em nova aba com rel seguro", () => {
    render(<Harness />);
    const link = screen.getByRole("link", { name: /Tópico B/ });
    expect(link.getAttribute("href")).toBe("https://x.test/b");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("conteúdo da config é texto, não HTML", () => {
    const evil = "<img src=x onerror=alert(1)>";
    render(
      <Harness
        a={appearance({
          start: { topics: [{ id: "x", label: evil, icon: "chat", action: { type: "write" } }] },
          contextBanner: { enabled: true, titleKey: "k" },
        })}
        siteContext={{ k: evil }}
      />,
    );
    expect(document.querySelector("img[src=x]")).toBeNull();
    expect(screen.getAllByText(evil)).toHaveLength(2);
  });
});

describe("modelo com apoio", () => {
  afterEach(cleanup);

  const assisted = () =>
    appearance({
      model: "assisted",
      allowExpand: true,
      start: { title: "Pergunta inicial", subtitle: "Dica inicial", topics: [TOPIC_SEND, TOPIC_URL] },
      closing: { enabled: true, resolvedLabel: "Fechei", needHelpLabel: "Preciso" },
    });

  it("mostra a pergunta inicial e, sem visitante, não mostra encerramento", () => {
    render(<Harness a={assisted()} />);
    expect(screen.getByText("Pergunta inicial")).toBeTruthy();
    expect(screen.getByText("Dica inicial")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fechei" })).toBeNull();
  });

  it("escolher tópico manda mensagem normal e abre a pergunta local depois dela", () => {
    const onSendSpy = vi.fn();
    render(<Harness a={assisted()} onSendSpy={onSendSpy} />);
    fireEvent.click(screen.getByRole("button", { name: "Tópico A" }));
    expect(onSendSpy).toHaveBeenCalledWith("Texto do tópico A");
    const text = logText();
    expect(text.indexOf("Texto do tópico A")).toBeLessThan(text.indexOf("Pergunta do tópico A"));
    expect(screen.getByText("Dica do tópico A")).toBeTruthy();
    // A pergunta local não vira mensagem do visitante.
    expect(onSendSpy).toHaveBeenCalledTimes(1);
    // Foco vai para a pergunta (o botão clicado saiu da tela).
    expect(document.activeElement?.textContent).toContain("Pergunta do tópico A");
  });

  it("responder mantém a ordem da conversa, some com as pílulas e fica o cartão do tutorial", () => {
    const onSendSpy = vi.fn();
    render(<Harness a={assisted()} onSendSpy={onSendSpy} />);
    fireEvent.click(screen.getByRole("button", { name: "Tópico A" }));
    fireEvent.click(screen.getByRole("button", { name: "Opção 1" }));
    expect(onSendSpy).toHaveBeenLastCalledWith("Texto da opção 1");
    const text = logText();
    expect(text.indexOf("Pergunta do tópico A")).toBeLessThan(text.indexOf("Texto da opção 1"));
    expect(screen.queryByRole("button", { name: "Opção 1" })).toBeNull();
    const link = screen.getByRole("link", { name: /Ver link/ });
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.getByText("Tutorial X")).toBeTruthy();
  });

  it("encerramento só envia o texto e some até o visitante voltar a falar", () => {
    const onSendSpy = vi.fn();
    const onClose = vi.fn();
    render(<Harness a={assisted()} onSendSpy={onSendSpy} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Tópico A" }));
    fireEvent.click(screen.getByRole("button", { name: "Fechei" }));
    expect(onSendSpy).toHaveBeenLastCalledWith("Fechei");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Preciso" })).toBeNull();
    // O botão saiu da tela: o foco vai para o campo, não se perde no body.
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Mensagem" }));
  });

  it("expandir só com loader capaz; sem ele volta o minimizar", () => {
    const onExpandedChange = vi.fn();
    const { unmount } = render(
      <Harness a={assisted()} canExpand onExpandedChange={onExpandedChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Expandir chat" }));
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("dialog").getAttribute("data-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Reduzir chat" }));
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    unmount();
    render(<Harness a={assisted()} canExpand={false} />);
    expect(screen.queryByRole("button", { name: "Expandir chat" })).toBeNull();
    expect(screen.getByRole("button", { name: "Minimizar chat" })).toBeTruthy();
  });

  it("minimizar mantém a pergunta; fechar volta o fluxo ao início", () => {
    const onClose = vi.fn();
    render(<Harness a={appearance({ ...assisted(), allowExpand: false })} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Tópico A" }));
    fireEvent.click(screen.getByRole("button", { name: "Minimizar chat" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Pergunta do tópico A")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fechar chat" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Pergunta do tópico A")).toBeNull();
  });
});

describe("modelo início guiado", () => {
  afterEach(cleanup);

  const guided = (p: Partial<WebchatAppearance> = {}) =>
    appearance({
      model: "guided",
      start: {
        title: "Título do início",
        subtitle: "Subtítulo do início",
        writeLabel: "Botão de escrever",
        topics: [TOPIC_SEND, TOPIC_URL, TOPIC_WRITE],
      },
      contextBanner: { enabled: true, titleKey: "pagina" },
      ...p,
    });

  it("tela inicial com título, tópicos, 'Você está em' e campo de mensagem", () => {
    render(<Harness a={guided()} siteContext={{ pagina: "Valor P" }} />);
    expect(screen.getByRole("heading", { name: "Título do início" })).toBeTruthy();
    expect(screen.getByText("Subtítulo do início")).toBeTruthy();
    expect(screen.getByText("Valor P").parentElement?.textContent).toBe("Você está em: Valor P");
    expect(within(screen.getByRole("list")).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("textbox", { name: "Mensagem" })).toBeTruthy();
    expect(screen.queryByRole("log")).toBeNull();
  });

  it("sem textos no canal: saudação como título e rótulo neutro", () => {
    render(<Harness a={guided({ start: { topics: [] } })} />);
    expect(screen.getByRole("heading", { name: "Saudação do canal" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Escrever mensagem" })).toBeTruthy();
  });

  it("botão de escrever e tópico 'write' só focam o campo", () => {
    render(<Harness a={guided()} />);
    const field = screen.getByRole("textbox", { name: "Mensagem" });
    fireEvent.click(screen.getByRole("button", { name: "Botão de escrever" }));
    expect(document.activeElement).toBe(field);
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(screen.getByRole("button", { name: "Tópico C" }));
    expect(document.activeElement).toBe(field);
    expect(screen.getByRole("heading", { name: "Título do início" })).toBeTruthy();
  });

  it("tópico que envia sai para a conversa com a pergunta local", () => {
    const onSendSpy = vi.fn();
    render(<Harness a={guided()} onSendSpy={onSendSpy} />);
    fireEvent.click(screen.getByRole("button", { name: "Tópico A" }));
    expect(onSendSpy).toHaveBeenCalledWith("Texto do tópico A");
    expect(screen.queryByRole("heading", { name: "Título do início" })).toBeNull();
    expect(logText()).toContain("Pergunta do tópico A");
  });

  it("escrever no campo também sai da tela inicial; quem já conversou entra na conversa", () => {
    const { unmount } = render(<Harness a={guided()} />);
    const field = screen.getByRole("textbox", { name: "Mensagem" });
    fireEvent.change(field, { target: { value: "Minha pergunta" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(screen.queryByRole("heading", { name: "Título do início" })).toBeNull();
    expect(logText()).toContain("Minha pergunta");
    unmount();
    render(
      <Harness
        a={guided()}
        messages={[
          { id: "h1", direction: "in", content: "Antiga", createdAt: "2026-01-01T10:00:00.000Z", status: "read" },
        ]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Título do início" })).toBeNull();
    expect(screen.getByText("01/01/2026")).toBeTruthy();
  });

  it("tópico de link abre em nova aba e fica na tela inicial", () => {
    render(<Harness a={guided()} />);
    const link = screen.getByRole("link", { name: /Tópico B/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    fireEvent.click(link);
    expect(screen.getByRole("heading", { name: "Título do início" })).toBeTruthy();
  });

  it("pré-chat e offline continuam na frente do modelo", () => {
    const { unmount } = render(<Harness a={guided()} view="prechat" />);
    expect(screen.queryByRole("heading", { name: "Título do início" })).toBeNull();
    expect(screen.getByRole("button", { name: "Iniciar conversa" })).toBeTruthy();
    unmount();
    render(<Harness a={guided()} view="offline" />);
    expect(screen.queryByRole("heading", { name: "Título do início" })).toBeNull();
  });
});
