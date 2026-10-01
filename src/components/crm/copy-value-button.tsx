"use client";

import { IconCopy } from "@tabler/icons-react";
import { toast } from "sonner";

import { TooltipGlass } from "@/components/crm/tooltip-glass";

/** Ícone de copiar no hover. O pai precisa da classe `group`. */
export function CopyValueButton({ text }: { text: string }) {
  return (
    <TooltipGlass label="Copiar" side="top" delay={300}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          void navigator.clipboard.writeText(text).then(
            () => toast.success("Copiado"),
            () => toast.error("Falha ao copiar"),
          );
        }}
        className="flex size-5 shrink-0 items-center justify-center rounded-[6px] text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] group-hover:opacity-100"
        aria-label="Copiar"
      >
        <IconCopy size={12} stroke={2.2} />
      </button>
    </TooltipGlass>
  );
}
