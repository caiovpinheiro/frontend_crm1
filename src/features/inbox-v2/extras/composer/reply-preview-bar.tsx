import { IconCornerUpLeft, IconX } from "@tabler/icons-react";
import type { ComposerProps } from "./types";

/** Barra de preview do reply (estilo WhatsApp) — logo acima do input. */
export function ReplyPreviewBar({
  replyTo,
  onCancelReply,
}: {
  replyTo: NonNullable<ComposerProps["replyTo"]>;
  onCancelReply: ComposerProps["onCancelReply"];
}) {
  return (
    <div className="mb-2 flex items-stretch gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 shadow-[var(--glass-shadow-sm)] backdrop-blur-md">
      <div className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 p-1.5 text-[var(--brand-primary)]">
        <IconCornerUpLeft size={14} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 border-l-[3px] border-[var(--brand-primary)] pl-2">
        <span className="font-display text-[10.5px] font-bold uppercase tracking-wider text-[var(--brand-primary)]">
          Respondendo {replyTo.senderName?.trim() ? `a ${replyTo.senderName.trim()}` : "mensagem"}
        </span>
        <span className="line-clamp-2 break-words font-body text-[12px] leading-snug text-[var(--text-secondary)]">
          {replyTo.preview}
        </span>
      </div>
      {onCancelReply && (
        <button
          type="button"
          onClick={onCancelReply}
          aria-label="Cancelar resposta"
          className="shrink-0 self-start rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}
