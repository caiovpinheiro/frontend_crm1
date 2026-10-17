import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { renderMessageText } from "../webchat-panel";

const html = (text: string) => renderToStaticMarkup(<>{renderMessageText(text)}</>);

describe("renderMessageText (widget)", () => {
  it("assinatura do agente e formatação do WhatsApp viram elementos, sem asteriscos", () => {
    expect(html("*Ana*: prazo de _3 a 5_ dias ~úteis~")).toBe(
      "<strong>Ana</strong>: prazo de <em>3 a 5</em> dias <s>úteis</s>",
    );
  });

  it("links http(s) clicáveis; HTML do texto é escapado", () => {
    expect(html("veja https://loja.test/p?a=1 <b>x</b>")).toBe(
      'veja <a href="https://loja.test/p?a=1" target="_blank" rel="noopener noreferrer nofollow">https://loja.test/p?a=1</a> &lt;b&gt;x&lt;/b&gt;',
    );
  });

  it("não formata `javascript:` como link", () => {
    expect(html("javascript:alert(1)")).toBe("javascript:alert(1)");
  });
});
