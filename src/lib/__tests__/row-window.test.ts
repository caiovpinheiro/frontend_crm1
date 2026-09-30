import { describe, expect, it, vi } from "vitest";

import {
  ROW_WINDOW_DEFAULT_HEIGHT,
  ROW_WINDOW_EAGER_ROWS,
  RowWindowRegistry,
  createRowWindowRegistry,
  initialRowVisible,
  rememberRowHeight,
  type RowWindowEntry,
  type RowWindowObserverLike,
} from "../row-window";

function fakeObserverFactory() {
  const observed = new Set<Element>();
  let emit: ((entries: RowWindowEntry[]) => void) | null = null;
  let disconnected = 0;
  let roots: (Element | null)[] = [];
  const factory = (
    onEntries: (entries: RowWindowEntry[]) => void,
    root: Element | null,
  ): RowWindowObserverLike => {
    emit = onEntries;
    roots.push(root);
    return {
      observe: (el) => observed.add(el),
      unobserve: (el) => observed.delete(el),
      disconnect: () => {
        disconnected += 1;
        observed.clear();
      },
    };
  };
  return {
    factory,
    observed,
    fire: (entries: RowWindowEntry[]) => emit?.(entries),
    get disconnected() {
      return disconnected;
    },
    get roots() {
      return roots;
    },
  };
}

// Em node não há DOM: qualquer objeto serve de chave de linha.
const el = () => ({}) as unknown as Element;

describe("initialRowVisible", () => {
  it("sem observer, tudo visível", () => {
    expect(initialRowVisible(0, false)).toBe(true);
    expect(initialRowVisible(500, false)).toBe(true);
  });
  it("com observer, só as primeiras linhas nascem renderizadas", () => {
    expect(initialRowVisible(0, true)).toBe(true);
    expect(initialRowVisible(ROW_WINDOW_EAGER_ROWS - 1, true)).toBe(true);
    expect(initialRowVisible(ROW_WINDOW_EAGER_ROWS, true)).toBe(false);
    expect(initialRowVisible(3, true, 2)).toBe(false);
  });
});

describe("rememberRowHeight", () => {
  it("usa a medida válida (arredondada)", () => {
    expect(rememberRowHeight(null, 101.6)).toBe(102);
    expect(rememberRowHeight(80, 120)).toBe(120);
  });
  it("mantém a anterior ou a estimativa quando a medida é inválida", () => {
    expect(rememberRowHeight(80, 0)).toBe(80);
    expect(rememberRowHeight(null, 0)).toBe(ROW_WINDOW_DEFAULT_HEIGHT);
    expect(rememberRowHeight(null, Number.NaN)).toBe(ROW_WINDOW_DEFAULT_HEIGHT);
    expect(rememberRowHeight(null, -5, 50)).toBe(50);
  });
});

describe("RowWindowRegistry", () => {
  it("linhas registradas antes do attach passam a ser observadas no attach", () => {
    const fake = fakeObserverFactory();
    const reg = new RowWindowRegistry(fake.factory);
    const a = el();
    const b = el();
    reg.register(a, () => {});
    reg.register(b, () => {});
    expect(reg.attached).toBe(false);
    expect(fake.observed.size).toBe(0);

    const root = el();
    reg.attach(root);
    expect(reg.attached).toBe(true);
    expect(fake.roots).toEqual([root]);
    expect(fake.observed.has(a)).toBe(true);
    expect(fake.observed.has(b)).toBe(true);
  });

  it("linhas registradas depois do attach entram direto no observer", () => {
    const fake = fakeObserverFactory();
    const reg = new RowWindowRegistry(fake.factory);
    reg.attach(null);
    const a = el();
    reg.register(a, () => {});
    expect(fake.observed.has(a)).toBe(true);
  });

  it("despacha (visível, altura) para a linha certa e ignora alvos desconhecidos", () => {
    const fake = fakeObserverFactory();
    const reg = new RowWindowRegistry(fake.factory);
    const a = el();
    const b = el();
    const cbA = vi.fn();
    const cbB = vi.fn();
    reg.register(a, cbA);
    reg.register(b, cbB);
    reg.attach(null);

    fake.fire([
      { target: a, isIntersecting: false, height: 104 },
      { target: el(), isIntersecting: true, height: 10 },
      { target: b, isIntersecting: true, height: 96 },
    ]);
    expect(cbA).toHaveBeenCalledTimes(1);
    expect(cbA).toHaveBeenCalledWith(false, 104);
    expect(cbB).toHaveBeenCalledTimes(1);
    expect(cbB).toHaveBeenCalledWith(true, 96);
  });

  it("unregister tira a linha do observer e para de despachar", () => {
    const fake = fakeObserverFactory();
    const reg = new RowWindowRegistry(fake.factory);
    const a = el();
    const cb = vi.fn();
    const off = reg.register(a, cb);
    reg.attach(null);
    off();
    expect(reg.size).toBe(0);
    expect(fake.observed.has(a)).toBe(false);
    fake.fire([{ target: a, isIntersecting: true, height: 90 }]);
    expect(cb).not.toHaveBeenCalled();
  });

  it("unregister de um callback antigo não derruba o registro novo da mesma linha", () => {
    const fake = fakeObserverFactory();
    const reg = new RowWindowRegistry(fake.factory);
    const a = el();
    const offOld = reg.register(a, () => {});
    const cbNew = vi.fn();
    reg.register(a, cbNew);
    offOld();
    reg.attach(null);
    fake.fire([{ target: a, isIntersecting: true, height: 90 }]);
    expect(cbNew).toHaveBeenCalledWith(true, 90);
  });

  it("detach desconecta; attach de novo recria o observer com as linhas atuais", () => {
    const fake = fakeObserverFactory();
    const reg = new RowWindowRegistry(fake.factory);
    const a = el();
    reg.register(a, () => {});
    reg.attach(null);
    reg.detach();
    expect(reg.attached).toBe(false);
    expect(fake.disconnected).toBe(1);
    reg.attach(null);
    expect(fake.observed.has(a)).toBe(true);
    expect(fake.roots).toHaveLength(2);
  });
});

describe("createRowWindowRegistry", () => {
  it("sem IntersectionObserver (node/SSR) devolve null — a lista renderiza tudo", () => {
    expect(createRowWindowRegistry()).toBeNull();
  });
});
