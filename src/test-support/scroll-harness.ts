/**
 * Apoio de teste (jsdom não tem layout): `IntersectionObserver` falso cujo
 * "está visível?" vem de um modelo de geometria dado pelo teste, e um
 * scroller com `scrollTop`/`scrollHeight`/`clientHeight` controlados.
 *
 * `flush()` faz o papel de um frame do navegador: avisa cada observer dos
 * alvos que mudaram de estado — e dos recém-observados, que sempre recebem
 * a 1ª notificação (é ela que encadeia páginas quando o observer é recriado
 * com a sentinela ainda visível).
 */
import { vi } from "vitest";

export type FakeIoModel = (
  target: Element,
  root: Element | null,
  marginPx: number,
) => boolean;

type IoCallback = (entries: IntersectionObserverEntry[], observer: unknown) => void;

export function installFakeIntersectionObserver(model: FakeIoModel) {
  const observers = new Set<FakeIO>();

  class FakeIO {
    readonly root: Element | null;
    readonly marginPx: number;
    readonly targets = new Map<Element, boolean | undefined>();

    constructor(
      readonly callback: IoCallback,
      options?: { root?: Element | null; rootMargin?: string },
    ) {
      this.root = options?.root ?? null;
      this.marginPx = Number.parseFloat(options?.rootMargin ?? "0") || 0;
    }

    observe(el: Element) {
      this.targets.set(el, undefined);
      observers.add(this);
    }

    unobserve(el: Element) {
      this.targets.delete(el);
    }

    disconnect() {
      this.targets.clear();
      observers.delete(this);
    }

    takeRecords() {
      return [];
    }
  }

  vi.stubGlobal("IntersectionObserver", FakeIO);

  return {
    flush() {
      for (const observer of [...observers]) {
        const entries: IntersectionObserverEntry[] = [];
        for (const [target, last] of [...observer.targets]) {
          if (!target.isConnected) continue;
          const now = model(target, observer.root, observer.marginPx);
          if (now === last) continue;
          observer.targets.set(target, now);
          entries.push({
            target,
            isIntersecting: now,
            boundingClientRect: { height: 0 },
          } as unknown as IntersectionObserverEntry);
        }
        if (entries.length > 0) observer.callback(entries, observer);
      }
    },
  };
}

/** Geometria de uma lista de linhas de altura fixa com a sentinela no fim. */
export type ListLayout = {
  /** Altura visível do scroller. */
  viewport: number;
  rowHeight: number;
  scrollTop: number;
  /** Linhas atualmente na lista. */
  rows: () => number;
};

export function listHeight(layout: ListLayout): number {
  return layout.rows() * layout.rowHeight;
}

/** A sentinela (no fim da lista) está dentro do viewport + margem? */
export function sentinelInView(layout: ListLayout, marginPx: number): boolean {
  return listHeight(layout) - layout.scrollTop <= layout.viewport + marginPx;
}

/** Liga `scrollTop`/`scrollHeight`/`clientHeight` do elemento ao modelo. */
export function bindScroller(el: HTMLElement, layout: ListLayout): void {
  Object.defineProperty(el, "clientHeight", {
    configurable: true,
    get: () => layout.viewport,
  });
  Object.defineProperty(el, "scrollHeight", {
    configurable: true,
    get: () => Math.max(listHeight(layout), layout.viewport),
  });
  Object.defineProperty(el, "scrollTop", {
    configurable: true,
    get: () => layout.scrollTop,
    set: (value: number) => {
      layout.scrollTop = value;
    },
  });
}

/** Rola até o fim da lista (um gesto) e dispara o evento de scroll. */
export function scrollToEnd(el: HTMLElement, layout: ListLayout): void {
  layout.scrollTop = Math.max(0, listHeight(layout) - layout.viewport);
  el.dispatchEvent(new Event("scroll"));
}

/** Latência do servidor falso — o estado "buscando" precisa chegar à tela. */
export const FAKE_LATENCY_MS = 15;

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Frames do navegador para os testes de rolagem. Cada frame: o observer
 * avisa quem mudou, o "buscando" é renderizado e a resposta chega — em
 * `act` separados, como na vida real (resposta instantânea esconderia o
 * estado de carregamento e, com ele, a recriação do observer).
 */
export function createFrames(
  io: { flush(): void },
  act: (cb: () => Promise<void>) => Promise<void>,
) {
  const frame = async () => {
    await act(async () => {
      io.flush();
      await sleep(1);
    });
    await act(async () => {
      await sleep(FAKE_LATENCY_MS + 10);
    });
  };
  const settle = async (frames = 8) => {
    for (let i = 0; i < frames; i += 1) await frame();
  };
  return { frame, settle };
}
