"use client";

/**
 * Lista com overflow-x: a página rola no Y.
 * A barra horizontal usa o mesmo visual 5px cinza da barra vertical da página.
 *
 * Column cabeçalho is lifted out of the X-scroller (portal / first-child split)
 * so `position: sticky` can pin to the page scrollport. Horizontal scroll is
 * synced between the header track and the body track.
 */

import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type HeaderMount = { mount: HTMLDivElement | null };

const ListHScrollHeaderContext = createContext<HeaderMount | null>(null);

/** Portal target for DataView column heads inside an H-scroll wrapper. */
export function useListHScrollHeaderMount() {
  return useContext(ListHScrollHeaderContext);
}

function isListColHead(node: ReactNode): boolean {
  if (!isValidElement<{ className?: string }>(node)) return false;
  return /\blist-col-head\b/.test(node.props.className ?? "");
}

function splitColHead(children: ReactNode): [ReactNode | null, ReactNode] {
  const items = Children.toArray(children);
  const idx = items.findIndex(isListColHead);
  if (idx < 0) return [null, children];
  return [items[idx], items.filter((_, i) => i !== idx)];
}

const HEAD_SCROLL_CLASS =
  "list-hscroll min-h-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

const BODY_SCROLL_CLASS =
  "list-hscroll min-h-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]";

type StickyHScrollProps = {
  children: ReactNode;
  className?: string;
  scrollerClassName?: string;
  /** Inner min-width (settings MobileTableScroll). */
  minWidth?: number;
  /** Edge fade when the row can scroll sideways. Default on. */
  fades?: boolean;
};

export function StickyHScroll({
  children,
  className,
  scrollerClassName,
  minWidth,
  fades = true,
}: StickyHScrollProps) {
  const [directHead, bodyChildren] = useMemo(() => splitColHead(children), [children]);
  const [headMount, setHeadMount] = useState<HTMLDivElement | null>(null);
  const headScrollRef = useRef<HTMLDivElement>(null);
  const bodyScrollRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const updateFades = useCallback(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setCanLeft(scrollLeft > 2);
    setCanRight(max > 2 && scrollLeft < max - 2);
  }, []);

  const syncFrom = useCallback((source: "head" | "body") => {
    const from = source === "head" ? headScrollRef.current : bodyScrollRef.current;
    const to = source === "head" ? bodyScrollRef.current : headScrollRef.current;
    if (!from || !to || syncingRef.current) return;
    if (to.scrollLeft === from.scrollLeft) return;
    syncingRef.current = true;
    to.scrollLeft = from.scrollLeft;
    syncingRef.current = false;
    updateFades();
  }, [updateFades]);

  useEffect(() => {
    const el = bodyScrollRef.current;
    if (!el) return;
    updateFades();
    el.addEventListener("scroll", updateFades, { passive: true });
    const ro = new ResizeObserver(updateFades);
    ro.observe(el);
    const mo = new MutationObserver(updateFades);
    mo.observe(el, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", updateFades);
    return () => {
      el.removeEventListener("scroll", updateFades);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", updateFades);
    };
  }, [updateFades]);

  const innerStyle: CSSProperties | undefined = minWidth
    ? { minWidth }
    : undefined;

  const ctx = useMemo<HeaderMount>(() => ({ mount: headMount }), [headMount]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <ListHScrollHeaderContext.Provider value={ctx}>
        <div
          className="sticky z-[15] bg-[var(--bg-base)]"
          style={{ top: "var(--page-header-sticky-h, 0px)" }}
        >
          <div
            ref={headScrollRef}
            className={cn(HEAD_SCROLL_CLASS, scrollerClassName)}
            onScroll={() => syncFrom("head")}
          >
            <div style={innerStyle}>
              {directHead}
              <div ref={setHeadMount} />
            </div>
          </div>
        </div>

        <div
          ref={bodyScrollRef}
          className={cn(BODY_SCROLL_CLASS, scrollerClassName)}
          onScroll={() => syncFrom("body")}
        >
          <div
            className={minWidth != null ? "flex flex-col gap-2" : undefined}
            style={innerStyle}
          >
            {bodyChildren}
          </div>
        </div>
      </ListHScrollHeaderContext.Provider>

      {fades ? (
        <>
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-[var(--bg-base)] via-[color-mix(in_srgb,var(--bg-base)_70%,transparent)] to-transparent transition-opacity duration-200",
              canLeft ? "opacity-100" : "opacity-0",
            )}
          />
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-[var(--bg-base)] via-[color-mix(in_srgb,var(--bg-base)_70%,transparent)] to-transparent transition-opacity duration-200",
              canRight ? "opacity-100" : "opacity-0",
            )}
          />
        </>
      ) : null}
    </div>
  );
}

type ListHScrollProps = {
  children: ReactNode;
  className?: string;
  /** Classes do container rolável interno. */
  scrollerClassName?: string;
};

export function ListHScroll({
  children,
  className,
  scrollerClassName,
}: ListHScrollProps) {
  return (
    <StickyHScroll className={className} scrollerClassName={scrollerClassName}>
      {children}
    </StickyHScroll>
  );
}
