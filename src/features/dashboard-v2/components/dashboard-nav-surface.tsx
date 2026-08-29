"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";

import { useClickVsDrag } from "@/features/dashboard-v2/click-vs-drag";
import { cn } from "@/lib/utils";

/** Card chrome that navigates only on a true click (no pointer travel past the drag threshold). */
export function DashboardNavSurface({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const guard = useClickVsDrag();

  if (!href) return <article className={className}>{children}</article>;

  return (
    <article
      className={cn(className, "cursor-pointer outline-none ring-primary hover:border-primary/30 focus-visible:ring-2")}
      role="link"
      tabIndex={0}
      onPointerDown={guard.onPointerDown}
      onPointerMove={guard.onPointerMove}
      onPointerUp={guard.onPointerUp}
      onClick={(event) => {
        if (guard.consumeIfDragged(event)) return;
        router.push(href);
      }}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(href);
        }
      }}
    >
      {children}
    </article>
  );
}
