/** @vitest-environment jsdom */
/**
 * `useScrollLoadMore` — um pedido de "carregar mais" por gesto de rolagem.
 */
import { act, cleanup, render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SCROLL_GESTURE_IDLE_MS,
  useScrollLoadMore,
} from "@/hooks/use-scroll-load-more";
import {
  bindScroller,
  installFakeIntersectionObserver,
  sentinelInView,
  type ListLayout,
} from "@/test-support/scroll-harness";

const MARGIN = 100;

function List(props: {
  rows: number;
  enabled?: boolean;
  loading?: boolean;
  resetKey?: string;
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

function setup(initial: { rows: number; enabled?: boolean; loading?: boolean }) {
  const onLoadMore = vi.fn();
  let container: HTMLElement | null = null;
  const layout: ListLayout = {
    viewport: 500,
    rowHeight: 100,
    scrollTop: 0,
    rows: () => container?.querySelectorAll("[data-row]").length ?? 0,
  };
  const io = installFakeIntersectionObserver((_target, _root, margin) =>
    sentinelInView(layout, margin),
  );
  let props = { ...initial, onLoadMore, resetKey: undefined as string | undefined };
  const view = render(<List {...props} />);
  container = view.container;
  const scroller = view.container.querySelector<HTMLElement>("[data-scroller]")!;
  bindScroller(scroller, layout);
  return {
    onLoadMore,
    layout,
    scroller,
    /** Um frame: o observer avisa quem mudou de estado. */
    frame: () => act(() => io.flush()),
    update: (next: Partial<typeof props>) => {
      props = { ...props, ...next };
      view.rerender(<List {...props} />);
    },
    /** Evento de rolagem `ms` depois do anterior. */
    gesture: (type: "scroll" | "wheel" | "touchmove", ms: number) => {
      vi.setSystemTime(Date.now() + ms);
      act(() => {
        scroller.dispatchEvent(new Event(type));
      });
    },
    scrollTo: (top: number) => {
      layout.scrollTop = top;
    },
  };
}

const NEW_GESTURE = SCROLL_GESTURE_IDLE_MS + 50;
const SAME_GESTURE = 16;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-01T12:00:00.000Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useScrollLoadMore", () => {
  it("1ª página que não enche o scroller: um preenchimento automático, e só", () => {
    const t = setup({ rows: 3 }); // 300px num viewport de 500
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    // Busca vai e volta sem a lista crescer; a sentinela segue visível.
    t.update({ loading: true });
    t.frame();
    t.update({ loading: false });
    t.frame();
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("lista que enche o scroller não pede nada até o usuário chegar ao fim", () => {
    const t = setup({ rows: 20 }); // 2.000px
    t.frame();
    expect(t.onLoadMore).not.toHaveBeenCalled();

    t.scrollTo(600);
    t.gesture("scroll", NEW_GESTURE);
    t.frame();
    expect(t.onLoadMore).not.toHaveBeenCalled();

    t.scrollTo(1500); // fim: 2.000 − 500
    t.gesture("scroll", SAME_GESTURE);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("o mesmo gesto parado no fim não pede de novo; um gesto novo pede mais uma vez", () => {
    const t = setup({ rows: 20 });
    t.frame();
    t.scrollTo(1500);
    t.gesture("scroll", NEW_GESTURE);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    // Inércia da roda no fim da lista, que não cresceu.
    for (let i = 0; i < 10; i += 1) t.gesture("wheel", SAME_GESTURE);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.gesture("wheel", NEW_GESTURE);
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 10; i += 1) t.gesture("wheel", SAME_GESTURE);
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("gesto longo: depois que a lista cresce, chegar ao novo fim pede a página seguinte", () => {
    const t = setup({ rows: 20 });
    t.frame();
    t.scrollTo(1500);
    t.gesture("scroll", NEW_GESTURE);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.update({ loading: true });
    t.update({ loading: false, rows: 40 }); // +20 linhas: a sentinela sai da área
    t.frame();
    for (let top = 1600; top < 3400; top += 100) {
      t.scrollTo(top);
      t.gesture("scroll", SAME_GESTURE);
      t.frame();
    }
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.scrollTo(3500); // novo fim: 4.000 − 500
    t.gesture("scroll", SAME_GESTURE);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("com pedido em voo nada dispara, e o gesto que começou durante a busca não vale outro", () => {
    const t = setup({ rows: 20 });
    t.frame();
    t.scrollTo(1500);
    t.gesture("scroll", NEW_GESTURE);
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.update({ loading: true });
    t.gesture("wheel", NEW_GESTURE); // gesto novo, com a busca em voo
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    // A resposta chega sem a lista crescer e o mesmo gesto continua.
    t.update({ loading: false });
    t.frame();
    for (let i = 0; i < 5; i += 1) t.gesture("wheel", SAME_GESTURE);
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.gesture("wheel", NEW_GESTURE);
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });

  it("scroll e observer no mesmo frame contam como um pedido", () => {
    const t = setup({ rows: 20 });
    t.frame();
    t.scrollTo(1500);
    t.gesture("scroll", NEW_GESTURE); // dispara pelo evento de scroll
    t.frame(); // o observer avisa a entrada da sentinela logo depois
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("desligado não pede; lista nova (`resetKey`) vale um preenchimento de novo", () => {
    const t = setup({ rows: 3, enabled: false });
    t.frame();
    t.gesture("wheel", NEW_GESTURE);
    expect(t.onLoadMore).not.toHaveBeenCalled();

    t.update({ enabled: true });
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);
    t.frame();
    expect(t.onLoadMore).toHaveBeenCalledTimes(1);

    t.update({ resetKey: "outra-aba" });
    t.scroller.dispatchEvent(new Event("scroll")); // mesmo gesto: sem permissão nova
    t.gesture("wheel", SAME_GESTURE);
    // A permissão voltou pela troca de lista, não pelo gesto.
    expect(t.onLoadMore).toHaveBeenCalledTimes(2);
  });
});
