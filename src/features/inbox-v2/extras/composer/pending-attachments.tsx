import type { Dispatch, SetStateAction } from "react";
import { IconFile, IconPaperclip, IconX } from "@tabler/icons-react";
import { formatFileSize } from "./attachment-helpers";
import type { PendingFile, PendingMedia } from "./types";

/** Anexo(s) encostado(s) por um modelo/mensagem rápida — vão junto no envio. */
export function PendingMediaChips({
  pendingMediaList,
  setPendingMediaList,
}: {
  pendingMediaList: PendingMedia[];
  setPendingMediaList: Dispatch<SetStateAction<PendingMedia[]>>;
}) {
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      {pendingMediaList.map((media, i) => {
        const before = i > 0 ? media.messageBefore?.trim() : "";
        return (
          <div
            key={`${media.url}-${i}`}
            className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 shadow-[var(--glass-shadow-sm)]"
          >
            <div className="flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)]/12 p-1.5 text-[var(--brand-primary)]">
              <IconPaperclip size={14} />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block truncate font-body text-[12px] text-[var(--text-secondary)]">
                {media.name?.trim() || "Anexo do modelo"} ·{" "}
                {media.sendBeforeText
                  ? "imagem com a mensagem (legenda)"
                  : "será enviado junto"}
              </span>
              {before ? (
                <span className="block truncate font-body text-[11px] italic text-[var(--text-muted)]">
                  Antes: &ldquo;{before}&rdquo;
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setPendingMediaList((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label="Remover anexo"
              className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
            >
              <IconX size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Overlay de drop — arquivo do SO sendo arrastado sobre a página. */
export function FileDropOverlay() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-[var(--brand-primary)]/10 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 rounded-[var(--radius-2xl)] border-2 border-dashed border-[var(--brand-primary)] bg-[var(--glass-bg-strong)] px-6 py-4 shadow-[var(--glass-shadow-lg)]">
        <IconPaperclip size={22} className="text-[var(--brand-primary)]" />
        <div className="font-body">
          <p className="text-[14px] font-semibold text-[var(--text-primary)]">
            Solte para anexar à conversa
          </p>
          <p className="text-[12px] text-[var(--text-secondary)]">
            O arquivo fica no composer; você escreve a legenda e envia.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Arquivos encostados (colados, arrastados ou anexados) — enviados no próximo envio. */
export function PendingFileChips({
  pendingFiles,
  removePendingFile,
}: {
  pendingFiles: PendingFile[];
  removePendingFile: (id: string) => void;
}) {
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {pendingFiles.map((f) => (
        <div
          key={f.id}
          className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-2 py-1.5 shadow-[var(--glass-shadow-sm)]"
        >
          {f.previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={f.previewUrl}
              alt={f.name}
              className="h-16 w-16 shrink-0 rounded-[var(--radius-sm)] object-cover"
            />
          ) : (
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
              <IconFile size={18} />
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="max-w-[160px] truncate font-body text-[12px] text-[var(--text-primary)]">
              {f.name}
            </span>
            <span className="font-body text-[10.5px] text-[var(--text-muted)]">
              {formatFileSize(f.file.size)}
            </span>
          </span>
          <button
            type="button"
            onClick={() => removePendingFile(f.id)}
            aria-label="Remover anexo"
            className="shrink-0 rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
          >
            <IconX size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
