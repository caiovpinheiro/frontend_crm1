/**
 * Janela de render para listas longas (FE-14) — sem dependência externa.
 *
 * Cada linha da lista é um wrapper sempre montado; o conteúdo (o card)
 * só é renderizado enquanto o wrapper está no viewport do scroller ± uma
 * margem. Ao sair, a linha vira um placeholder com a última altura
 * medida — o scroll não pula e a barra mantém o tamanho.
 *
 * Um único `IntersectionObserver` por lista (root = scroller) observa
 * todas as linhas; este módulo é a parte pura (registro + decisão),
 * testável em node. A parte React vive em `components/crm/windowed-row`.
 */

/** Altura estimada de uma linha nunca medida (card de conversa ≈ 3 linhas). */
export const ROW_WINDOW_DEFAULT_HEIGHT = 92;
/** Linhas iniciais renderizadas antes da 1ª medição (evita lista vazia no 1º frame). */
export const ROW_WINDOW_EAGER_ROWS = 24;
/** Margem acima/abaixo do viewport em que as linhas já ficam renderizadas. */
export const ROW_WINDOW_MARGIN = "600px 0px";

export type RowWindowCallback = (visible: boolean, measuredHeight: number) => void;

export interface RowWindowEntry {
  target: Element;
  isIntersecting: boolean;
  /** Altura do wrapper no momento da transição (`boundingClientRect.height`). */
  height: number;
}

export interface RowWindowObserverLike {
  observe(el: Element): void;
  unobserve(el: Element): void;
  disconnect(): void;
}

export type RowWindowObserverFactory = (
  onEntries: (entries: RowWindowEntry[]) => void,
  root: Element | null,
) => RowWindowObserverLike;

/**
 * Antes do observer existir (SSR / navegador sem IO / registro `null`),
 * tudo é visível. Com observer, só as primeiras `eager` linhas nascem
 * renderizadas; o IO corrige no frame seguinte.
 */
export function initialRowVisible(
  index: number,
  canObserve: boolean,
  eager = ROW_WINDOW_EAGER_ROWS,
): boolean {
  if (!canObserve) return true;
  return index < eager;
}

/**
 * Altura a lembrar quando a linha sai da janela: usa a medida quando
 * válida; senão mantém a anterior ou a estimativa.
 */
export function rememberRowHeight(
  prev: number | null,
  measured: number,
  fallback = ROW_WINDOW_DEFAULT_HEIGHT,
): number {
  if (Number.isFinite(measured) && measured > 0) return Math.round(measured);
  return prev ?? fallback;
}

/**
 * Registro de linhas + observer. As linhas se registram nos seus efeitos
 * (que rodam ANTES do efeito do pai); o pai chama `attach(root)` quando o
 * scroller existe e o observer passa a observar tudo que já foi
 * registrado. Linhas registradas depois entram direto no observer.
 */
export class RowWindowRegistry {
  private readonly rows = new Map<Element, RowWindowCallback>();
  private observer: RowWindowObserverLike | null = null;

  constructor(private readonly factory: RowWindowObserverFactory) {}

  get size(): number {
    return this.rows.size;
  }

  get attached(): boolean {
    return this.observer !== null;
  }

  register(el: Element, cb: RowWindowCallback): () => void {
    this.rows.set(el, cb);
    this.observer?.observe(el);
    return () => {
      if (this.rows.get(el) !== cb) return;
      this.rows.delete(el);
      this.observer?.unobserve(el);
    };
  }

  attach(root: Element | null): void {
    this.detach();
    const observer = this.factory((entries) => this.dispatch(entries), root);
    this.observer = observer;
    for (const el of this.rows.keys()) observer.observe(el);
  }

  detach(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private dispatch(entries: RowWindowEntry[]): void {
    for (const entry of entries) {
      this.rows.get(entry.target)?.(entry.isIntersecting, entry.height);
    }
  }
}

function intersectionObserverFactory(
  onEntries: (entries: RowWindowEntry[]) => void,
  root: Element | null,
): RowWindowObserverLike {
  return new IntersectionObserver(
    (entries) =>
      onEntries(
        entries.map((e) => ({
          target: e.target,
          isIntersecting: e.isIntersecting,
          height: e.boundingClientRect.height,
        })),
      ),
    { root, rootMargin: ROW_WINDOW_MARGIN },
  );
}

/** `null` quando não há `IntersectionObserver` (SSR / navegador antigo): a lista renderiza tudo. */
export function createRowWindowRegistry(): RowWindowRegistry | null {
  if (typeof window === "undefined" || typeof IntersectionObserver === "undefined") return null;
  return new RowWindowRegistry(intersectionObserverFactory);
}
