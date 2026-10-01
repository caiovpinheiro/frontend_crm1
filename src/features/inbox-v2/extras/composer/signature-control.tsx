import { IconCheck, IconPencil, IconSignature, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { TooltipGlass } from "@/components/crm/tooltip-glass";
import type { ComposerSignature } from "./use-composer-signature";

/** Assinatura do agente: toggle + nome (editável quando a org permite). */
export function SignatureControl({
  signature,
  agentName,
  signatureEditable,
}: {
  signature: ComposerSignature;
  agentName: string;
  signatureEditable: boolean;
}) {
  const {
    sigEnabled,
    sigValue,
    sigEditing,
    setSigEditing,
    sigDraft,
    setSigDraft,
    effectiveSignature,
    persistSigEnabled,
    persistSigValue,
  } = signature;
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        role="switch"
        aria-checked={sigEnabled}
        aria-label={sigEnabled ? "Desligar assinatura" : "Ligar assinatura"}
        onClick={() => persistSigEnabled(!sigEnabled)}
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors",
          sigEnabled ? "bg-[var(--brand-primary)]" : "bg-[var(--text-muted)]/40",
        )}
      >
        <span
          className={cn(
            "inline-block size-3 rounded-full bg-white shadow transition-transform",
            sigEnabled ? "translate-x-[14px]" : "translate-x-[2px]",
          )}
        />
      </button>
      <IconSignature size={13} className="shrink-0 text-[var(--text-muted)]" />
      {sigEditing ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={sigDraft}
            onChange={(e) => setSigDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                persistSigValue(sigDraft.trim());
                setSigEditing(false);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setSigEditing(false);
              }
            }}
            placeholder={agentName || "Seu nome"}
            className="h-6 w-40 rounded-[var(--radius-sm)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2 font-body text-[11.5px] text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
          />
          <button
            type="button"
            aria-label="Salvar assinatura"
            onClick={() => { persistSigValue(sigDraft.trim()); setSigEditing(false); }}
            className="rounded-[var(--radius-sm)] p-0.5 text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10"
          >
            <IconCheck size={14} />
          </button>
          <button
            type="button"
            aria-label="Cancelar"
            onClick={() => setSigEditing(false)}
            className="rounded-[var(--radius-sm)] p-0.5 text-[var(--text-muted)] hover:bg-[var(--text-muted)]/10"
          >
            <IconX size={14} />
          </button>
        </span>
      ) : (
        <>
          <TooltipGlass
            label={effectiveSignature ? `Assinando como ${effectiveSignature}` : "Defina um nome para assinar"}
            side="top"
          >
            <span
              className={cn(
                "max-w-[140px] truncate font-body text-[11.5px] font-semibold transition-colors",
                sigEnabled
                  ? "text-[var(--text-primary)]"
                  : "text-[var(--text-muted)] line-through",
              )}
            >
              {effectiveSignature || "Sem assinatura"}
            </span>
          </TooltipGlass>
          {signatureEditable && (
            <button
              type="button"
              aria-label="Editar assinatura"
              onClick={() => { setSigDraft(sigValue); setSigEditing(true); }}
              className="rounded-[var(--radius-sm)] p-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)]"
            >
              <IconPencil size={12} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
