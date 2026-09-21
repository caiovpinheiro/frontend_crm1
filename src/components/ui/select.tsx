"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { IconChevronDown as ChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export interface SelectNativeProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(
  ({ className, children, disabled, ...props }, ref) => {
    return (
      <div
        className={cn(
          "relative grid w-full items-center [&>select]:col-start-1 [&>select]:row-start-1"
        )}
      >
        <select
          ref={ref}
          disabled={disabled}
          className={cn(
            // Padrão filtro/segmento — contorno leve + hover primary-soft.
            "col-start-1 row-start-1 flex h-9 w-full appearance-none rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg-modal,#fff)] py-1 ps-3 pe-9 font-display text-[12.5px] font-semibold text-[var(--text-primary)] shadow-none outline-none transition-colors hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] disabled:cursor-not-allowed disabled:opacity-50",
            "focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40",
            "aria-invalid:border-[var(--color-danger)] aria-invalid:ring-[var(--color-danger)]/20",
            className
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden
          className={cn(
            "pointer-events-none col-start-1 row-start-1 ms-auto me-2.5 size-4 justify-self-end text-[var(--text-muted)]",
            disabled && "opacity-50"
          )}
        />
      </div>
    );
  }
);
SelectNative.displayName = "SelectNative";

type SelectContextValue = {
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Record<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
  triggerRef: React.RefObject<HTMLDivElement | null>;
};

const SelectContext = React.createContext<SelectContextValue | null>(null);

function useSelectContext(component: string) {
  const ctx = React.useContext(SelectContext);
  if (!ctx) throw new Error(`${component} must be used within <Select>`);
  return ctx;
}

function Select({
  value,
  onValueChange,
  children,
}: {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [labels, setLabels] = React.useState<Record<string, React.ReactNode>>(
    {}
  );
  const triggerRef = React.useRef<HTMLDivElement>(null);
  const registerLabel = React.useCallback(
    (itemValue: string, label: React.ReactNode) => {
      setLabels((prev) =>
        prev[itemValue] === label ? prev : { ...prev, [itemValue]: label }
      );
    },
    []
  );

  return (
    <SelectContext.Provider
      value={{ value, onValueChange, open, setOpen, labels, registerLabel, triggerRef }}
    >
      <div ref={triggerRef} className="relative">{children}</div>
    </SelectContext.Provider>
  );
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { size?: "sm" | "default" }) {
  const { open, setOpen } = useSelectContext("SelectTrigger");
  return (
    <button
      type="button"
      data-slot="select-trigger"
      aria-expanded={open}
      className={cn(
        "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      onClick={() => setOpen(!open)}
      {...props}
    >
      {children}
      <ChevronDown aria-hidden className="size-4 shrink-0 opacity-60" />
    </button>
  );
}

function SelectValue({
  placeholder,
  children,
  className,
}: {
  placeholder?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const { value, labels } = useSelectContext("SelectValue");
  const shown = children ?? (value ? labels[value] : null) ?? placeholder;
  return (
    <span
      data-slot="select-value"
      className={cn("flex flex-1 truncate text-left", className)}
    >
      {shown}
    </span>
  );
}

function SelectContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, setOpen, triggerRef } = useSelectContext("SelectContent");
  const ref = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState<{ top: number; left: number; width: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    };
    updatePosition();
    const onDoc = (e: MouseEvent) => {
      const clickedTrigger = triggerRef.current?.contains(e.target as Node);
      const clickedContent = ref.current?.contains(e.target as Node);
      if (!clickedTrigger && !clickedContent) {
        setOpen(false);
      }
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, setOpen, triggerRef]);

  if (!open || !position) {
    // Render items invisíveis para que os labels sejam registrados
    // e o SelectValue consiga mostrar o rótulo mesmo sem abrir.
    return (
      <div
        data-slot="select-content-hidden"
        className="pointer-events-none invisible absolute"
        aria-hidden="true"
      >
        {children}
      </div>
    );
  }
  return createPortal(
    <div
      ref={ref}
      data-slot="select-content"
      style={{
        position: "fixed",
        top: position.top,
        left: position.left,
        width: position.width,
        zIndex: 50,
      }}
      className={cn(
        "mt-1 max-h-60 overflow-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
        className
      )}
      {...props}
    >
      {children}
    </div>,
    document.body,
  );
}

function SelectItem({
  value,
  className,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: selected, onValueChange, setOpen, registerLabel } =
    useSelectContext("SelectItem");

  React.useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  return (
    <button
      type="button"
      data-slot="select-item"
      data-selected={selected === value || undefined}
      className={cn(
        "relative flex w-full cursor-default items-center rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground",
        selected === value && "bg-accent text-accent-foreground",
        className
      )}
      onClick={() => {
        onValueChange?.(value);
        setOpen(false);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

export {
  SelectNative,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
};
