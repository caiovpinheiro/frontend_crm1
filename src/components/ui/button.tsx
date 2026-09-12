"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

function mergeRefs<T>(
  ...refs: (React.Ref<T> | undefined)[]
): React.RefCallback<T> {
  return (value) => {
    for (const ref of refs) {
      if (ref == null) continue;
      if (typeof ref === "function") ref(value);
      else (ref as React.MutableRefObject<T | null>).current = value;
    }
  };
}

function Slot({
  children,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  children: React.ReactElement;
  ref?: React.Ref<unknown>;
}) {
  const { ref: refFromProps, ...rest } = props;
  if (!React.isValidElement(children)) {
    throw new Error("Slot expects a single valid React element child.");
  }
  const child = children as React.ReactElement<{
    ref?: React.Ref<unknown>;
    className?: string;
    style?: React.CSSProperties;
  }>;
  return React.cloneElement(child, {
    ...rest,
    ...child.props,
    ref: mergeRefs(
      refFromProps as React.Ref<unknown> | undefined,
      child.props.ref
    ),
    className: cn(
      (rest as { className?: string }).className,
      child.props.className
    ),
    style: {
      ...(rest as { style?: React.CSSProperties }).style,
      ...child.props.style,
    },
  } as never);
}

// DS-003: classes canônicas do botão glass (fonte única).
// `secondary` é um alias @deprecated para `glass` — use `glass` em código novo.
const _GLASS_BTN =
  "bg-[var(--glass-bg-overlay)] backdrop-blur border border-[var(--glass-border)] text-foreground shadow-[var(--glass-shadow-sm)] hover:bg-[var(--glass-bg-strong)] hover:-translate-y-px hover:shadow-[var(--glass-shadow)]";

const buttonVariants = cva(
  // Base glassmorphism: fonte display, peso 600, radius full, transição suave
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-display text-sm font-semibold transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-primary/25 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Brand sólido com glow — CTA primário
        default:
          "bg-primary text-primary-foreground hover:bg-primary-dark",
        destructive:
          "bg-destructive text-destructive-foreground shadow-[0_4px_14px_rgba(239,68,68,0.30)] hover:bg-destructive/90 hover:-translate-y-px",
        // Outline limpo
        outline:
          "border border-primary/60 bg-transparent text-primary hover:bg-primary/10",
        /** @deprecated DS-003 — use `glass`. Mantido para retrocompatibilidade; será removido em onda futura. */
        secondary: _GLASS_BTN,
        // Fantasma sem fundo
        ghost: "border border-[var(--glass-border-subtle)] text-[var(--color-ink-soft)] hover:bg-[var(--glass-bg-overlay)] hover:text-foreground",
        // Link
        link: "text-primary underline-offset-4 hover:underline",
        // Lavanda — IA / Copilot
        ai:
          "bg-lavender text-lavender-foreground shadow-[0_4px_14px_rgba(167,139,250,0.35)] hover:opacity-95 hover:-translate-y-px hover:shadow-[var(--shadow-lavender-glow)]",
        // Glass — superfície translúcida (padrão DS v2)
        glass: _GLASS_BTN,
      },
      size: {
        default: "h-9 px-5 py-2",
        sm:      "h-7 px-3.5 text-xs",
        lg:      "h-11 px-7 text-base",
        icon:    "size-9 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    if (asChild) {
      const { children, ...rest } = props;
      if (!React.isValidElement(children)) {
        throw new Error("asChild requires a single React element child.");
      }
      return (
        <Slot
          ref={ref as React.Ref<unknown>}
          className={cn(buttonVariants({ variant, size, className }))}
          {...(rest as React.ComponentPropsWithoutRef<"span">)}
        >
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
