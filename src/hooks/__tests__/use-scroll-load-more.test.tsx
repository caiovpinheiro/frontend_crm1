/** @vitest-environment jsdom */
/**
 * `useScrollLoadMore` — um pedido de "carregar mais" por gesto de rolagem.
 *
 * "Gesto" = o usuário rola (roda, toque, teclado, barra) uma tela desde o
 * último pedido, ou a sentinela sai da área de disparo e volta. O evento
 * `scroll` sozinho (o navegador também rola: scroll anchoring, clamp) e
 * pausas entre cliques de roda não liberam pedido.
 */
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useScrollLoadMore } from "@/hooks/use-scroll-load-more";
import {
  bindScroller,
  installFakeIntersectionObserver,
  sentinelInView,
  type ListLayout,
} from "@/test-support/scroll-harness";

const MARGIN = 100;
const VIEWPORT = 500;

function List(props: {
  rows: number;
  enabled?: boolean;
  loading?: boolean;
  resetKey?: string;
  maxAutoPages?: number;
  onLoadMore: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useScrollLoadMore({
    scrollerRef,
    enabled: props.enabled ?? true,
    loading: props.loading ?? false,
    onLoadMore: props.onLoadMore,
    marginPx: MARGIN,
    resetKey: props.resetKey,
    maxAutoPages: props.maxAutoPages,
  });
  return (
    <div ref={scrollerRef} data-scroller>
      {Array.from({ length: props.rows }, (_, i) => (
        <div key={i} data-row />
      ))}
      {(props.enabled ?? true) ? <div ref={sentinelRef} data-sentinel /> : null}
    </div>
  );
}

type Props = Omit<Parameters<typeof List>[0], "onLoadMore">;

function setup(initial: Props) {
  const onLoadMore = vi.fn();
  let container: HTMLElement | null = null;
  const layout: ListLayout = {
    viewport: VIEWPORT,
    rowHeight: 100,
    scrollTop: 0,
    rows: () => container?.querySelectorAll("[data-row]").length ?? 0,
  };
  const io = installFakeIntersectionObserver((_target, _root, margin) =>
    sentinelInView(layout, margin),
  );
  let props: Props = { ...initial };
  const view = render(<List {...props} onLoadMore={onLoadMore} />);
  container = view.container;
  const scroller = view.container.querySelector<HTMLElement>("[data-scroller]")!;
  bindScroller(scroller, layout);
  const dispatch = (ev: Event) =>
    act(() => {
      scroller.dispatchEvent(ev);
    });
  return {
    onLoadMore,
    layout,
    scroller,
    /** Um frame: o observer avisa quem mudou de estado. */
    frame: () => act(() => io.flush()),
    update: (next: Partial<Props>) => {
      props = { ...props, ...next };
      view.rerender(<List {...props} onLoadMore={onLoadMore} />);
    },
    /** Resposta do pedido: `loading` liga e desliga; a lista ganha `added` linhas. */
    respond: (added = 0) => {
      props = { ...props, loading: true };
      view.rerender(<List {...props} onLoadMore={onLoadMore} />);
      props = { ...props, loading: false, rows: props.rows + added };
      view.rerender(<List {...props} onLoadMore={onLoadMore} />);
    },
    /** Clique de roda (100px para baixo); a lista rola se puder. */
    wheel: (deltaY = 100) => {
      const max = Math.max(0, layout.rows() * layout.rowHeight - layout.viewport);
      layout.scrollTop = Math.min(max, layout.scrollTop + deltaY);
      dispatch(Object.assign(new Event("wheel"), { deltaY, deltaMode: 0 }));
      dispatch(new Event("scroll"));
    },
    /** `scroll` sem ação do usuário (scroll anchoring, clamp). */
    browserScroll: (top: number) => {
      layout.scrollTop = top;
      dispatch(new Event("scroll"));
    },
    key: (key: string) => dispatch(new KeyboardEvent("keydown", { key, bubbles: true })),
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("useScrollLoadMore", () => {
  it("1ª página que não enche o scroller: um preenchimento automático, e só", () => {
    const t = setup({ rows: 3 }); // 300px num viewport de 500
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    // Busca vai e volta sem a lista crescer; a sentinela segue visível.
    t.respond(0);
    t.frame();
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("lista que enche o scroller não pede nada até o usuário chegar ao fim", () => {
    const t = setup({ rows: 20 }); // 2.000px
    t.frame();
    expect(t.onLoadMore).not.toHaveBeenCalled();
    for (let i = 0; i < 9; i += 1) t.wheel(); // 900px
    t.frame();
    expect(t.onLoadMore).not.toHaveBeenCalled();
    for (let i = 0; i < 6; i += 1) t.wheel(); // fim: 1.500px
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("cliques de roda no fim (a lista não cresceu): um pedido por tela rolada, não por clique", () => {
    const t = setup({ rows: 20 });
    t.frame();
    // 14 cliques: a sentinela entra na margem (100px) e sai o pedido.
    for (let i = 0; i < 14; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    t.respond(0);
    t.frame();

    // Quatro cliques (400px < uma tela de 500px): nada.
    for (let i = 0; i < 4; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    // O quinto completa uma tela: mais um pedido.
    t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
    t.respond(0);
    for (let i = 0; i < 4; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("`scroll` do navegador (scroll anchoring) no fim não libera pedido", () => {
    const t = setup({ rows: 20 });
    t.frame();
    for (let i = 0; i < 14; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    // Linhas entram acima da tela: a âncora empurra o scrollTop, a
    // sentinela continua visível. Várias vezes, espaçadas.
    t.respond(50);
    for (let top = 2000; top <= 6500; top += 500) {
      t.browserScroll(top);
      t.frame();
    }
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("gesto longo: depois que a lista cresce, chegar ao novo fim pede a página seguinte", () => {
    const t = setup({ rows: 20 });
    t.frame();
    for (let i = 0; i < 14; i += 1) t.wheel();
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.respond(20); // +20 linhas: a sentinela sai da área
    t.frame();
    // De 1.400 até 3.300: ainda longe do novo fim (4.000 − 500 − 100).
    for (let i = 0; i < 19; i += 1) {
      t.wheel();
      t.frame();
    }
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    t.wheel(); // 3.400: chegou ao novo fim
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("rolagem feita durante a busca não vale outro pedido quando a resposta chega", () => {
    const t = setup({ rows: 20 });
    t.frame();
    for (let i = 0; i < 14; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.update({ loading: true });
    for (let i = 0; i < 10; i += 1) t.wheel(); // 1.000px com a busca em voo
    t.frame();
    t.update({ loading: false });
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    // Depois da resposta, uma tela de rolagem libera de novo.
    for (let i = 0; i < 5; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("preenchimento (maxAutoPages): página que não passa da tela puxa a seguinte, até o teto", () => {
    const t = setup({ rows: 2, maxAutoPages: 3 }); // 200px num viewport de 500
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    // Páginas que acrescentam 0 linhas: o fim segue na tela → mais uma, sozinha.
    t.respond(0);
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
    t.respond(0);
    t.respond(0);
    expect(t.onLoadMore).toHaveBeenCalledTimes(4);
    // Teto (3 automáticas): agora espera o usuário.
    t.respond(0);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(4);
    // Uma tela de rolagem do usuário: pede e o teto recomeça.
    for (let i = 0; i < 5; i += 1) t.wheel();
    expect(t.onLoadMore).toHaveBeenCalledTimes(5);
    t.respond(0);
    expect(t.onLoadMore).toHaveBeenCalledTimes(6);
  });

  it("preenchimento para quando a lista passa da tela", () => {
    const t = setup({ rows: 2, maxAutoPages: 5 });
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    t.respond(3); // 500px: o fim ainda está na margem → mais uma
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
    t.respond(20); // 2.500px: o fim saiu da área
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("sem maxAutoPages (Kanban/Flow), uma página que não passa da tela não puxa outra", () => {
    const t = setup({ rows: 2 });
    t.frame();
    t.respond(0);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("teclado (End / PageDown) também conta como rolagem do usuário", () => {
    const t = setup({ rows: 20 });
    t.frame();
    t.layout.scrollTop = 1500;
    t.key("End");
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    t.respond(0);
    t.key("PageDown");
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("desligado não pede; lista nova (`resetKey`) vale um preenchimento de novo", () => {
    const t = setup({ rows: 3, enabled: false });
    t.frame();
    t.wheel(1000);
    expect(t.onLoadMore).not.toHaveBeenCalled();

    t.update({ enabled: true });
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    t.respond(0);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.update({ resetKey: "outra-aba" });
    t.browserScroll(0);
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });
});
