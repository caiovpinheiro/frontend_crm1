"use client";

import * as React from "react";

import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

/** Ajuda longa: duas linhas + tooltip / “ver mais”. */
export function ClampedHelp({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const long = children.length > 140;

  if (!long) {
    return (
      <p className={cn("text-xs text-muted-foreground", className)}>{children}</p>
    );
  }

  return (
    <div className={className}>
      <TooltipHost label={children} side="bottom" align="start">
        <p
          className={cn(
            "text-xs text-muted-foreground",
            !expanded && "line-clamp-2",
          )}
        >
          {children}
        </p>
      </TooltipHost>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-1 text-xs font-medium text-primary hover:underline"
      >
        {expanded ? "ver menos" : "ver mais"}
      </button>
    </div>
  );
}

export function FieldHelp({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
