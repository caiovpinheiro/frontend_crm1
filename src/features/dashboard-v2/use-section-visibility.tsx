"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SectionVisibilityContext = createContext<{
  register: (group: string, el: Element | null) => void;
  isArmed: (group: string) => boolean;
} | null>(null);

export function SectionVisibilityProvider({
  children,
  rootMargin = "400px 0px 400px 0px",
}: {
  children: React.ReactNode;
  rootMargin?: string;
}) {
  const [armed, setArmed] = useState<Set<string>>(() => new Set());
  const refs = useRef<Map<Element, string>>(new Map());

  const observe = useCallback((group: string, el: Element | null) => {
    if (!el) return;
    refs.current.set(el, group);
  }, []);

  const isArmed = useCallback(
    (group: string) => armed.has(group),
    [armed],
  );

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setArmed(new Set(["service-rest", "service-heavy"]));
      return;
    }
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const entry of entries) {
          const group = refs.current.get(entry.target);
          if (!group) continue;
          if (entry.isIntersecting && !seen.has(group)) {
            seen.add(group);
            changed = true;
          }
        }
        if (changed) {
          setArmed(new Set(seen));
        }
      },
      { root: null, rootMargin, threshold: 0 },
    );
    for (const [el] of refs.current) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, [rootMargin]);

  const value = useMemo(
    () => ({ register: observe, isArmed }),
    [observe, isArmed],
  );

  return (
    <SectionVisibilityContext.Provider value={value}>
      {children}
    </SectionVisibilityContext.Provider>
  );
}

export function useSectionVisibility(group: string) {
  const ctx = useContext(SectionVisibilityContext);
  if (!ctx) {
    return {
      ref: (_el: Element | null) => {},
      armed: true,
    };
  }
  const ref = useCallback(
    (el: Element | null) => ctx.register(group, el),
    [ctx, group],
  );
  return { ref, armed: ctx.isArmed(group) };
}
