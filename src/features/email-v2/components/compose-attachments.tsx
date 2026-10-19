"use client";

import * as React from "react";
import { IconPaperclip, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/** Limites espelhados do backend (`POST /api/emails/send`): só para feedback imediato. */
export const EMAIL_ATTACHMENTS_MAX_FILES = 10;
export const EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Estado dos anexos do compose: lista, limites, input oculto e abrir seletor.
 * Usado pelo ComposeView (tela) e pelo ComposeModal (janela) para não duplicar.
 */
export function useComposeAttachments() {
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const add = React.useCallback((list: FileList | File[] | null) => {
    if (!list) return;
    const incoming = Array.from(list).filter((f) => f.size > 0);
    if (incoming.length === 0) return;
    setFiles((prev) => {
      const next = [...prev, ...incoming];
      if (next.length > EMAIL_ATTACHMENTS_MAX_FILES) {
        setError(`No máximo ${EMAIL_ATTACHMENTS_MAX_FILES} anexos por e-mail.`);
        return prev;
      }
      const total = next.reduce((sum, f) => sum + f.size, 0);
      if (total > EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES) {
        setError(`Os anexos somam ${formatBytes(total)}; o limite é ${formatBytes(EMAIL_ATTACHMENTS_MAX_TOTAL_BYTES)}.`);
        return prev;
      }
      setError(null);
      return next;
    });
  }, []);

  const remove = React.useCallback((index: number) => {
    setError(null);
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const reset = React.useCallback(() => {
    setFiles([]);
    setError(null);
  }, []);

  const open = React.useCallback(() => inputRef.current?.click(), []);

  const input = (
    <input
      ref={inputRef}
      type="file"
      multiple
      className="hidden"
      aria-hidden
      tabIndex={-1}
      onChange={(e) => {
        add(e.target.files);
        e.target.value = "";
      }}
    />
  );

  return { files, error, add, remove, reset, open, input };
}

export function AttachButton({
  onClick,
  disabled,
  count,
}: {
  onClick: () => void;
  disabled?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Anexar arquivo"
      aria-label={count ? `Anexar arquivo (${count} anexado${count > 1 ? "s" : ""})` : "Anexar arquivo"}
      className={cn(
        "relative inline-flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] disabled:opacity-40",
        count ? "text-[var(--brand-primary)]" : null,
      )}
    >
      <IconPaperclip size={16} />
      {count ? (
        <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-[var(--brand-primary)] px-1 text-center font-display text-[10px] font-bold leading-4 text-[var(--brand-primary-foreground,white)]">
          {count}
        </span>
      ) : null}
    </button>
  );
}

export function AttachmentChips({
  files,
  onRemove,
  disabled,
  className,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  if (files.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Anexos">
      {files.map((file, index) => (
        <li
          key={`${file.name}-${file.size}-${index}`}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-base)] py-1 pl-2.5 pr-1 font-body text-xs text-[var(--text-primary)]"
        >
          <IconPaperclip size={12} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
          <span className="truncate" title={file.name}>
            {file.name}
          </span>
          <span className="shrink-0 text-[var(--text-muted)]">{formatBytes(file.size)}</span>
          <button
            type="button"
            onClick={() => onRemove(index)}
            disabled={disabled}
            aria-label={`Remover anexo ${file.name}`}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <IconX size={12} />
          </button>
        </li>
      ))}
    </ul>
  );
}
