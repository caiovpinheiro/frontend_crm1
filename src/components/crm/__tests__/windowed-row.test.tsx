import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ROW_WINDOW_DEFAULT_HEIGHT,
  ROW_WINDOW_EAGER_ROWS,
  RowWindowRegistry,
} from "@/lib/row-window";
import { WindowedRow } from "../windowed-row";

/**
 * Sem DOM só dá para exercitar o 1º render (SSR): é ele que decide o que
 * nasce renderizado antes da 1ª medição do IntersectionObserver.
 */
function registry() {
  return new RowWindowRegistry(() => ({
    observe() {},
    unobserve() {},
    disconnect() {},
  }));
}

describe("WindowedRow — 1º render", () => {
  it("sem registro (SSR / sem IntersectionObserver) renderiza o conteúdo em qualquer posição", () => {
    const html = renderToStaticMarkup(
      <WindowedRow registry={null} index={500}>
        {() => <span>card</span>}
      </WindowedRow>,
    );
    expect(html).toContain("<span>card</span>");
    expect(html).not.toContain("aria-hidden");
    expect(html).not.toContain("height:");
  });

  it("com registro, as primeiras linhas nascem renderizadas", () => {
    const html = renderToStaticMarkup(
      <WindowedRow registry={registry()} index={ROW_WINDOW_EAGER_ROWS - 1}>
        <span>card</span>
      </WindowedRow>,
    );
    expect(html).toContain("<span>card</span>");
  });

  it("com registro, as demais viram placeholder com a altura estimada e sem invocar o render do conteúdo", () => {
    let rendered = 0;
    const html = renderToStaticMarkup(
      <WindowedRow registry={registry()} index={ROW_WINDOW_EAGER_ROWS}>
        {() => {
          rendered += 1;
          return <span>card</span>;
        }}
      </WindowedRow>,
    );
    expect(rendered).toBe(0);
    expect(html).not.toContain("card");
    expect(html).toContain(`height:${ROW_WINDOW_DEFAULT_HEIGHT}px`);
    expect(html).toContain('aria-hidden="true"');
  });

  it("wrapper mantém `shrink-0` (lista flex-col + overflow) e aceita className", () => {
    const html = renderToStaticMarkup(
      <WindowedRow registry={null} index={0} className="extra">
        <span>card</span>
      </WindowedRow>,
    );
    expect(html).toMatch(/class="shrink-0 extra"/);
  });
});
