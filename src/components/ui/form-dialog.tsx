"use client";

import * as React from "react";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  type DialogSize,
} from "@/components/ui/dialog";

/**
 * Padrão unificado de modal central para formulários de criação e edição.
 *
 * ```
 * <FormDialog
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Novo contato"
 *   description="Cadastre um contato e vincule empresa e tags."
 *   icon={<FormDialogIcon><UserPlus className="size-4" /></FormDialogIcon>}
 *   size="md"
 *   footer={
 *     <>
 *       <ButtonGlass variant="glass" className={formDialogCancelClass}>Cancelar</ButtonGlass>
 *       <ButtonGlass variant="primary" className={formDialogPrimaryClass}>Criar</ButtonGlass>
 *     </>
 *   }
 * >
 *   <span className={formLabelClass}>Nome *</span>
 *   <InputGlass className={formControlClass} />
 * </FormDialog>
 * ```
 *
 * Header e footer fixos; o corpo (children) rola. Portais de dropdown usam
 * ModalPortalContext do DialogContent.
 */

type FormDialogSize = "sm" | "md" | "lg" | "xl" | "2xl";

/** Badge circular do header — círculo primary suave, ícone primary. */
export function FormDialogIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      {children}
    </span>
  );
}

/** Plus no canto do glifo (empresa / negócio). Contato usa `UserPlus` nativo. */
export function FormDialogGlyphPlus({ children }: { children: React.ReactNode }) {
  return (
    <span className="relative inline-flex size-4 items-center justify-center">
      {children}
      <Plus className="absolute -right-1.5 -top-0.5 size-2.5" strokeWidth={2.75} aria-hidden />
    </span>
  );
}

/** Labels de FormDialog: small, ALL-CAPS, muted. Listas continuam sentence-case. */
export const formLabelClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/** Inputs / pickers / busca de tags: raio xl, borda muted, fundo card. */
export const formControlClass =
  "h-11 w-full rounded-xl border border-border bg-card px-3.5";

/** Cancelar: pill branco com borda. Não é botão-texto. */
export const formDialogCancelClass =
  "rounded-full border border-border bg-card px-4 text-foreground shadow-none hover:bg-secondary";

/** Criar / Salvar: pill primary. Sem `text-white`. */
export const formDialogPrimaryClass =
  "rounded-full bg-primary px-4 text-primary-foreground shadow-none hover:bg-primary/90 hover:translate-y-0";

/** Mapeia os tamanhos legados para presets do Dialog. */
const SIZE_TO_DIALOG: Record<FormDialogSize, DialogSize> = {
  sm: "sm",
  md: "md",
  lg: "lg",
  xl: "xl",
  "2xl": "2xl",
};

export interface FormDialogProps {
  /** Estado do modal (controlled). */
  open: boolean;
  /** Callback chamado quando o modal solicita abrir/fechar. */
  onOpenChange: (open: boolean) => void;
  /** Titulo exibido no header. */
  title: React.ReactNode;
  /** Descricao curta abaixo do titulo (opcional). */
  description?: React.ReactNode;
  /** Icone opcional a esquerda do titulo (`FormDialogIcon`). */
  icon?: React.ReactNode;
  /** Largura maxima do modal. Default: `md` (~512px). */
  size?: FormDialogSize;
  /**
   * Conteudo do rodape (ex.: botoes Cancelar/Salvar). Se omitido, footer
   * nao e renderizado.
   */
  footer?: React.ReactNode;
  /**
   * Quando true, impede o fechamento (util enquanto uma mutation esta em
   * andamento). Backdrop click, ESC e DialogClose sao ignorados.
   */
  busy?: boolean;
  /** Classes adicionais aplicadas ao corpo rolavel. */
  bodyClassName?: string;
  /** Classes adicionais aplicadas ao painel do modal. */
  className?: string;
  /** Conteúdo extra no header (ex.: botão de tour), à esquerda do X. */
  headerAccessory?: React.ReactNode;
  children: React.ReactNode;
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  icon,
  size = "md",
  footer,
  busy = false,
  bodyClassName,
  className,
  headerAccessory,
  children,
}: FormDialogProps) {
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (busy && !next) return;
      onOpenChange(next);
    },
    [busy, onOpenChange],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size={SIZE_TO_DIALOG[size]}
        panelClassName={cn("relative", className)}
        bodyClassName="flex flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="shrink-0 px-6 pb-1 pt-5 text-left">
          <div className="flex items-start gap-3 pe-8">
            {icon ? (
              <span className="mt-0.5 flex shrink-0 items-center justify-center">{icon}</span>
            ) : null}
            <div className="min-w-0">
              <DialogTitle>{title}</DialogTitle>
              {description ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        {headerAccessory ? (
          <div className="absolute end-[2.75rem] top-3.5 z-10">{headerAccessory}</div>
        ) : null}

        <DialogClose
          disabled={busy}
          className={cn(busy && "pointer-events-none opacity-40")}
        />

        <div
          className={cn(
            "min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-6 py-5",
            bodyClassName,
          )}
        >
          {children}
        </div>

        {footer ? (
          <DialogFooter className="shrink-0 border-t border-border bg-card px-6 py-4 sm:flex-row sm:justify-end">
            {footer}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
