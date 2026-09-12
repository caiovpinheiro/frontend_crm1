import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border-transparent px-2.5 py-0.5 text-xs font-medium leading-none transition-colors",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground",
        secondary:
          "bg-secondary text-secondary-foreground",
        outline:
          "border-border bg-transparent text-foreground",
        destructive:
          "bg-destructive/12 text-destructive",
        success:
          "bg-success text-success-foreground",
        warning:
          "bg-accent text-accent-foreground",
        indigo:
          "bg-primary/10 text-primary",
        ai:
          "bg-primary/10 text-primary",
        pink:
          "bg-[var(--avatar-1)] text-[var(--avatar-1-foreground)]",
        lead:
          "bg-accent text-accent-foreground",
        glass:
          "bg-secondary text-secondary-foreground",
        muted:
          "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// Badge de IA com gradiente lavanda→rosa e ícone estrela
function AIBadge({
  children = "IA",
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium leading-none text-primary-foreground",
        className
      )}
      {...props}
    >
      <svg width="8" height="8" viewBox="0 0 12 12" fill="currentColor" className="shrink-0">
        <path d="M6 0 L7.2 4.8 L12 6 L7.2 7.2 L6 12 L4.8 7.2 L0 6 L4.8 4.8 Z" />
      </svg>
      {children}
    </div>
  );
}

export { Badge, badgeVariants, AIBadge };
