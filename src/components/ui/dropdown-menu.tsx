"use client";

import * as React from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

type DropdownMenuContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  contentRef: React.RefObject<HTMLDivElement | null>;
  contentId: string;
};

const DropdownMenuContext =
  React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu(component: string) {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <DropdownMenu>`);
  }
  return ctx;
}

export interface DropdownMenuProps {
  children: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Classe extra aplicada ao container relative que envolve trigger+content. */
  className?: string;
}

function DropdownMenu({
  children,
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  className,
}: DropdownMenuProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const contentId = React.useId();

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      // O conteúdo agora é renderizado em portal (fora do containerRef), então
      // checamos os dois: clique no trigger/wrapper OU dentro do menu não fecha.
      if (containerRef.current?.contains(t)) return;
      if (contentRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, setOpen]);

  const value = React.useMemo(
    () => ({ open, setOpen, triggerRef, contentRef, contentId }),
    [open, setOpen, contentId]
  );

  return (
    <DropdownMenuContext.Provider value={value}>
      <div
        ref={containerRef}
        className={cn("relative inline-block text-left", className)}
      >
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

export interface DropdownMenuTriggerProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuTriggerProps
>(({ className, children, onClick, ...props }, ref) => {
  const { open, setOpen, triggerRef, contentId } =
    useDropdownMenu("DropdownMenuTrigger");

  const mergedRef = React.useCallback(
    (node: HTMLButtonElement | null) => {
      (triggerRef as React.MutableRefObject<HTMLButtonElement | null>).current =
        node;
      if (typeof ref === "function") ref(node);
      else if (ref != null)
        (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    },
    [ref, triggerRef]
  );

  return (
    <button
      ref={mergedRef}
      type="button"
      id={contentId}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      {...props}
      onClick={(e) => {
        onClick?.(e);
        setOpen(!open);
      }}
    >
      {children}
    </button>
  );
});
DropdownMenuTrigger.displayName = "DropdownMenuTrigger";

export interface DropdownMenuContentProps
  extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "end";
}

type Coords = { top: number; left?: number; right?: number };

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  DropdownMenuContentProps
>(({ className, align = "start", onKeyDown, style, ...props }, ref) => {
  const { open, contentId, triggerRef, contentRef } =
    useDropdownMenu("DropdownMenuContent");
  const [coords, setCoords] = React.useState<Coords | null>(null);

  // Calcula a posição (fixed) a partir do retângulo do trigger sempre que
  // abre. Renderizamos em portal no <body> pra escapar de qualquer ancestral
  // com `overflow-hidden` (toolbars do inbox/kanban etc.) que antes cortava
  // o menu e o deixava invisível.
  //
  // Auto-flip: se não couber abaixo do trigger (ex.: o "+" do compositor, que
  // fica na base da tela), abre PRA CIMA. A 1ª passada posiciona sem conhecer
  // a altura do conteúdo (ainda não montado); um requestAnimationFrame faz a
  // 2ª passada já com a altura real e corrige o lado — imperceptível porque a
  // 1ª posição costuma cair fora da tela (invisível) antes de subir.
  React.useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    const trigger = triggerRef.current;
    if (!trigger) return;

    const update = () => {
      const r = trigger.getBoundingClientRect();
      const content = contentRef.current;
      const ch = content?.offsetHeight ?? 0;
      const cw = content?.offsetWidth ?? 0;
      const margin = 4;

      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      const openUp = ch > 0 && spaceBelow < ch + margin && spaceAbove > spaceBelow;
      const top = openUp
        ? Math.max(8, r.top - ch - margin)
        : r.bottom + margin;

      if (align === "end") {
        setCoords({ top, right: Math.max(8, window.innerWidth - r.right) });
      } else {
        // Clampa à esquerda pra não vazar a borda direita quando o menu é largo.
        const maxLeft = cw > 0 ? window.innerWidth - cw - 8 : window.innerWidth - 8;
        const left = Math.min(Math.max(8, r.left), Math.max(8, maxLeft));
        setCoords({ top, left });
      }
    };
    update();
    // 2ª passada com a altura/largura reais do conteúdo já montado.
    const raf = requestAnimationFrame(update);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align, triggerRef, contentRef]);

  const mergedRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      (contentRef as React.MutableRefObject<HTMLDivElement | null>).current =
        node;
      if (typeof ref === "function") ref(node);
      else if (ref != null)
        (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [ref, contentRef]
  );

  if (!open || coords == null || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={mergedRef}
      role="menu"
      aria-labelledby={contentId}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        right: coords.right,
        // Neutraliza classes de posicionamento herdadas (ex.: `bottom-full`
        // usado por menus que abriam pra cima no layout antigo). Com `position:
        // fixed` + `top` inline, um `bottom` vindo de classe esticaria o menu.
        bottom: "auto",
        ...style,
      }}
      className={cn(
        // `--color-popover` é translúcido (0.75) por design glassmorphic. Como
        // o conteúdo agora é portalado pro <body> e pode cair sobre o gradiente
        // do chat, sem o blur ficava ilegível. `backdrop-blur-xl` + sombra forte
        // restauram a leitura (vidro fosco), consistente com o header do inbox.
        "z-50 min-w-32 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-xl outline-none backdrop-blur-xl",
        className
      )}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (e.key === "Escape") e.stopPropagation();
      }}
      {...props}
    />,
    document.body
  );
});
DropdownMenuContent.displayName = "DropdownMenuContent";

export interface DropdownMenuItemProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  inset?: boolean;
}

const DropdownMenuItem = React.forwardRef<
  HTMLButtonElement,
  DropdownMenuItemProps
>(({ className, inset, disabled, onClick, ...props }, ref) => {
  const { setOpen } = useDropdownMenu("DropdownMenuItem");
  return (
    <button
      ref={ref}
      type="button"
      role="menuitem"
      className={cn(
        // Hover azul (primary-soft) — padrão Funil; evita hover branco invisível em menus claros.
        "relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-[var(--color-primary-soft)] focus:text-[var(--brand-primary)]",
        inset && "ps-8",
        !disabled &&
          "hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)]",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
      disabled={disabled}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented && !disabled) setOpen(false);
      }}
    />
  );
});
DropdownMenuItem.displayName = "DropdownMenuItem";

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    role="separator"
    className={cn("-mx-1 my-1 h-px bg-border", className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = "DropdownMenuSeparator";

const DropdownMenuLabel = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold text-foreground",
      inset && "ps-8",
      className
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = "DropdownMenuLabel";

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
};
