"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { IconX as X } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { ModalPortalContext } from "@/components/ui/modal-portal-context";

type DialogContextValue = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialogContext(component: string) {
  const ctx = React.useContext(DialogContext);
  if (!ctx) {
    throw new Error(`${component} must be used within <Dialog>`);
  }
  return ctx;
}

export interface DialogProps {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: DialogProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange]
  );

  const value = React.useMemo(
    () => ({ open, onOpenChange: setOpen }),
    [open, setOpen]
  );

  return (
    <DialogContext.Provider value={value}>{children}</DialogContext.Provider>
  );
}

/**
 * Presets de largura pra padronizar modais no app inteiro. Antes cada
 * tela passava `panelClassName="sm:max-w-md"` / `max-w-lg` / etc. de
 * forma inconsistente e o UX ficava "ilha no canto" em monitores
 * grandes quando a modal era pequena demais pro conteúdo.
 *
 * Escolha pela complexidade do formulário:
 * - sm  ~384px : confirmações (AlertDialog), 1-2 campos
 * - md  ~512px : formulário curto (3-5 campos, uma coluna)
 * - lg  ~672px : formulário médio (até 10 campos, grid 2 colunas)
 * - xl  ~896px : formulário complexo (wizard, configuração ampla)
 * - 2xl ~1152px: builders, previews lado-a-lado
 */
export type DialogSize = "sm" | "md" | "lg" | "xl" | "2xl";

const DIALOG_SIZE_CLASS: Record<DialogSize, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-6xl",
};

export interface DialogContentProps
  extends Omit<React.HTMLAttributes<HTMLDialogElement>, "children"> {
  children: React.ReactNode;
  /** Preset de largura (default: "md"). Chamadores podem ainda
   * sobrescrever via `panelClassName="max-w-..."` — o twMerge no `cn`
   * garante que a última classe vence. */
  size?: DialogSize;
  /** Classes extras no painel (shell arredondado: borda, bg, tamanho,
   * shadow). Útil pra sobrescrever largura/cor de fundo por modal. */
  panelClassName?: string;
  /** Classes extras no wrapper de scroll interno (padding, gap, overflow).
   * Modais full-bleed que gerenciam o próprio padding/scroll passam
   * `bodyClassName="p-0 gap-0"` aqui. Default: `grid gap-4 p-6`. */
  bodyClassName?: string;
  /** Aceito por compat com o editor de fluxo (shadcn). Sem efeito aqui. */
  showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<HTMLDialogElement, DialogContentProps>(
  ({ className, children, size = "md", panelClassName, bodyClassName, showCloseButton: _showCloseButton, ...props }, ref) => {
    const { open, onOpenChange } = useDialogContext("DialogContent");
    const internalRef = React.useRef<HTMLDialogElement | null>(null);
    // Nó publicado no contexto de portal: popovers/menus (DropdownGlass) portam
    // pra dentro do `<dialog>` (top-layer) em vez do body, senão ficam atrás do
    // backdrop e os cliques são interceptados pelo modal.
    const [portalNode, setPortalNode] = React.useState<HTMLDialogElement | null>(
      null
    );

    const setRefs = React.useCallback(
      (node: HTMLDialogElement | null) => {
        internalRef.current = node;
        setPortalNode(node);
        if (typeof ref === "function") ref(node);
        else if (ref != null)
          (ref as React.MutableRefObject<HTMLDialogElement | null>).current =
            node;
      },
      [ref]
    );

    const [mounted, setMounted] = React.useState(false);
    React.useEffect(() => setMounted(true), []);
    // Clique que abre o modal ainda está no ar: o `<dialog>` vira top-layer
    // e o mesmo pointerup/click cai no backdrop → abre e fecha. Ignora
    // dismiss nesse intervalo.
    const ignoreDismissUntil = React.useRef(0);
    const shouldIgnoreDismiss = React.useCallback(
      () => Date.now() < ignoreDismissUntil.current,
      [],
    );

    // Reexecuta quando `mounted` fica true — o portal só existe após isso.
    React.useEffect(() => {
      if (!mounted) return;
      const el = internalRef.current;
      if (!el) return;
      if (open) {
        if (!el.open) {
          ignoreDismissUntil.current = Date.now() + 400;
          el.showModal();
        }
      } else if (el.open) {
        el.close();
      }
    }, [open, mounted]);

    React.useEffect(() => {
      const el = internalRef.current;
      if (!el) return;
      const onClose = () => {
        if (shouldIgnoreDismiss()) {
          if (!el.open) el.showModal();
          return;
        }
        onOpenChange?.(false);
      };
      el.addEventListener("close", onClose);
      return () => el.removeEventListener("close", onClose);
    }, [onOpenChange, shouldIgnoreDismiss]);

    const onDialogClick = (e: React.MouseEvent<HTMLDialogElement>) => {
      if (e.target !== internalRef.current) return;
      if (shouldIgnoreDismiss()) return;
      onOpenChange?.(false);
    };

    // Fechado: some do DOM. Um `<dialog>` invisível com `fixed inset-0 z-50`
    // (wizard/playground sempre montados) interceptava o clique do lápis —
    // o editor abria e o mesmo clique caía no backdrop e fechava.
    if (!mounted || !open) return null;

    return createPortal(
      <dialog
        ref={setRefs}
        className={cn(
          // `<dialog>` nativo tem estilos do UA (margin: auto, border,
          // etc.) que já tentam centralizar, mas tiramos tudo pra o
          // nosso wrapper controlar layout. `h-full w-full` garante
          // que, mesmo se algum agente de acessibilidade/tema ignorar
          // `open:flex`, o backdrop continue ocupando a tela toda.
          "fixed inset-0 z-50 m-0 h-full max-h-none w-full max-w-none border-0 bg-transparent p-0",
          "backdrop:bg-black/30 backdrop:backdrop-blur-md",
          "open:flex open:items-center open:justify-center open:p-4",
          className
        )}
        onClick={onDialogClick}
        onCancel={(e) => {
          e.preventDefault();
          if (shouldIgnoreDismiss()) return;
          onOpenChange?.(false);
        }}
        {...props}
      >
        <div
          role="document"
          className={cn(
            // Painel base glass (DS v2):
            // - radius via token --radius-2xl
            // - superfície via --glass-bg-modal (dark automático)
            // - max-h dinâmico acompanha o viewport mobile (100dvh)
            //
            // IMPORTANTE: `overflow-hidden` (nao auto) fica NESTE nivel pra
            // recortar a scrollbar do wrapper interno no formato dos cantos
            // arredondados. Se o scroll ficasse aqui (elemento arredondado),
            // a scrollbar — que e um retangulo reto — vazaria pelos cantos
            // superior/inferior direito, parecendo estar "fora" da modal.
            // O scroll real acontece no wrapper interno abaixo.
            "relative z-50 mx-auto my-auto flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] text-[var(--text-primary)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl transition-[opacity,transform] duration-200",
            DIALOG_SIZE_CLASS[size],
            panelClassName
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <ModalPortalContext.Provider value={portalNode}>
            {/* Wrapper de scroll: aqui vive o overflow-y-auto + padding. Como
                o pai tem overflow-hidden + rounded, a scrollbar deste wrapper
                fica recortada no formato dos cantos (nunca "fora"). O `p-6`
                garante que o conteudo respira e a scrollbar fica encostada
                na borda interna, nao no canto arredondado. Modais full-bleed
                sobrescrevem via bodyClassName (ex: p-0 gap-0). */}
            <div
              className={cn(
                "grid min-h-0 flex-1 gap-4 overflow-y-auto overflow-x-hidden p-6",
                bodyClassName
              )}
            >
              {children}
            </div>
          </ModalPortalContext.Provider>
        </div>
      </dialog>,
      document.body
    );
  }
);
DialogContent.displayName = "DialogContent";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn("font-display text-lg font-bold leading-tight tracking-tight text-[var(--text-primary)]", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[var(--text-muted)]", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export interface DialogCloseProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {}

const DialogClose = React.forwardRef<HTMLButtonElement, DialogCloseProps>(
  ({ className, children, type = "button", onClick, ...props }, ref) => {
    const { onOpenChange } = useDialogContext("DialogClose");
    return (
      <button
        ref={ref}
        type={type}
        className={cn(
          "absolute end-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none",
          className
        )}
        aria-label="Fechar"
        onClick={(e) => {
          onClick?.(e);
          if (!e.defaultPrevented) onOpenChange?.(false);
        }}
        {...props}
      >
        {children ?? <X className="size-4" />}
      </button>
    );
  }
);
DialogClose.displayName = "DialogClose";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
