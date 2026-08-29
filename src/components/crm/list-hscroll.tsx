"use client";

/**
 * Lista com overflow-x: a página rola no Y.
 * A barra horizontal usa o mesmo visual 5px cinza da barra vertical da página.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type ListHScrollProps = {
  children: React.ReactNode;
  className?: string;
  /** Classes do container rolável interno. */
  scrollerClassName?: string;
};

export function ListHScroll({
  children,
  className,
  scrollerClassName,
}: ListHScrollProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const max = scrollWidth - clientWidth;
    setCanLeft(scrollLeft > 2);
    setCanRight(max > 2 && scrollLeft < max - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [update]);

  return (
    <div className={cn("relative min-w-0", className)}>
      <div
        ref={ref}
        className={cn(
          "list-hscroll min-h-0 overflow-x-auto overflow-y-hidden overscroll-x-contain [-webkit-overflow-scrolling:touch]",
          scrollerClassName,
        )}
      >
        {children}
      </div>

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
    </div>
  );
}
