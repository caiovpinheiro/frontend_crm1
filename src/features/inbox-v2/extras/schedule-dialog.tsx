"use client";

/*
 * Agendar mensagem — paridade com o painel do ChatWindow legado:
 *  - texto e/ou anexo (upload prévio em /api/uploads/automation-media);
 *  - template fallback OPCIONAL (Meta): se a sessão de 24h estiver expirada
 *    no horário do envio, o worker usa o template em vez do texto livre.
 *    Canal Baileys não tem janela de 24h — o host esconde a opção via
 *    `allowTemplateFallback={false}`;
 *  - validação local (conteúdo ou anexo, data futura, template escolhido
 *    quando o fallback está ligado) antes do POST.
 */

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  IconClock,
  IconFileText,
  IconPaperclip,
  IconX,
} from "@tabler/icons-react";

import { ButtonGlass } from "@/components/crm/button-glass";
import { Textarea } from "@/components/ui/textarea";
import {
  createScheduledMessage,
  uploadAutomationMedia,
  type WhatsappTemplate,
} from "@/features/inbox-v2/api";
import { scheduledMessagesKey } from "@/features/inbox-v2/hooks/use-scheduled-messages";

import { WhatsappTemplatePickerModal } from "./template-picker-popover";

const inputClass =
  "h-[var(--input-height)] w-full rounded-[var(--input-radius)] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 font-body text-[13px] text-[var(--input-text)] outline-none placeholder:text-[var(--input-placeholder)] backdrop-blur-sm transition-[border-color,box-shadow] duration-150 focus:border-[var(--input-border-focus)] focus:ring-2 focus:ring-[var(--input-ring-focus)]";

const labelClass =
  "mb-1 block font-display text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]";

const chipButtonClass =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-1 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--glass-bg-overlay)] disabled:opacity-50";

/** Mesmo teto do ChatWindow legado (e do upload de anexos do backend). */
export const SCHEDULE_ATTACHMENT_MAX_BYTES = 16 * 1024 * 1024;
export const SCHEDULE_ATTACHMENT_ACCEPT =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt";

export interface ScheduleFallbackTemplate {
  /** Nome canônico WABA — vai em `fallbackTemplate.name`. */
  name: string;
  /** Rótulo de exibição. */
  label?: string;
  language: string;
}

export function fallbackTemplateFromPicker(
  tpl: WhatsappTemplate,
): ScheduleFallbackTemplate {
  return {
    name: tpl.metaTemplateName ?? tpl.name,
    label: tpl.name,
    language: tpl.language ?? "pt_BR",
  };
}

/** Valor de `<input type="datetime-local">` no fuso local, sem segundos. */
export function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface ScheduleFormInput {
  content: string;
  /** Valor cru do `datetime-local`. */
  scheduledAt: string;
  hasAttachment: boolean;
  useFallback: boolean;
  fallbackTemplate: ScheduleFallbackTemplate | null;
  /** Injetável nos testes. */
  now?: number;
}

export type ScheduleValidation =
  | { ok: true; when: Date }
  | { ok: false; error: string };

export function validateScheduleForm(
  input: ScheduleFormInput,
): ScheduleValidation {
  if (!input.content.trim() && !input.hasAttachment) {
    return { ok: false, error: "Informe um conteúdo ou anexo" };
  }
  const when = input.scheduledAt.trim() ? new Date(input.scheduledAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return { ok: false, error: "Informe uma data/hora válida" };
  }
  if (when.getTime() <= (input.now ?? Date.now())) {
    return { ok: false, error: "A data precisa ser no futuro" };
  }
  if (input.useFallback && !input.fallbackTemplate) {
    return { ok: false, error: "Escolha o template fallback" };
  }
  return { ok: true, when };
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export interface ScheduleDialogProps {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  initialContent?: string;
  /** Canal de envio atual — filtra os templates do picker de fallback. */
  channelId?: string | null;
  contactName?: string | null;
  /** `false` em canal Baileys (sem janela de 24h → sem fallback). Default true. */
  allowTemplateFallback?: boolean;
}

/**
 * Casca: o corpo (e todo o estado do formulário) só monta com `open` —
 * cada abertura começa limpa sem effect de reset.
 */
export function ScheduleDialog(props: ScheduleDialogProps) {
  if (!props.open) return null;
  return <ScheduleDialogBody {...props} />;
}

function ScheduleDialogBody({
  onClose,
  conversationId,
  initialContent,
  channelId,
  contactName,
  allowTemplateFallback = true,
}: Omit<ScheduleDialogProps, "open">) {
  const qc = useQueryClient();
  const ids = useId();
  const [content, setContent] = useState(initialContent ?? "");
  const [scheduledAt, setScheduledAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [useFallback, setUseFallback] = useState(false);
  const [fallbackTemplate, setFallbackTemplate] =
    useState<ScheduleFallbackTemplate | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fallbackOn = allowTemplateFallback && useFallback;

  const mutation = useMutation<void, Error, void>({
    mutationFn: async () => {
      if (!conversationId) throw new Error("Conversa inválida");
      const check = validateScheduleForm({
        content,
        scheduledAt,
        hasAttachment: !!file,
        useFallback: fallbackOn,
        fallbackTemplate,
      });
      if (!check.ok) throw new Error(check.error);

      let media: { url: string; type?: string; name?: string } | undefined;
      if (file) {
        const up = await uploadAutomationMedia(file);
        media = { url: up.url, type: up.mimeType, name: up.fileName };
      }

      await createScheduledMessage({
        conversationId,
        content: content.trim(),
        scheduledAt: check.when.toISOString(),
        ...(media ? { media } : {}),
        ...(fallbackOn && fallbackTemplate
          ? {
              fallbackTemplate: {
                name: fallbackTemplate.name,
                language: fallbackTemplate.language,
              },
            }
          : {}),
      });
    },
    onSuccess: () => {
      toast.success("Mensagem agendada");
      qc.invalidateQueries({ queryKey: scheduledMessagesKey(conversationId) });
      onClose();
    },
    onError: (err) => toast.error(err.message || "Falha ao agendar"),
  });

  const canSubmit =
    !mutation.isPending &&
    (!!content.trim() || !!file) &&
    !!scheduledAt &&
    (!fallbackOn || !!fallbackTemplate);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    mutation.mutate();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > SCHEDULE_ATTACHMENT_MAX_BYTES) {
      toast.warning("O arquivo excede o limite de 16 MB.");
      return;
    }
    setFile(f);
  }

  const contentId = `${ids}-content`;
  const whenId = `${ids}-when`;
  const fallbackId = `${ids}-fallback`;

  return createPortal(
    <div
      className="fixed inset-0 z-(--z-popover) flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        // `min` fica só como dica do seletor; a validação (e a mensagem) é a
        // nossa, para o erro sair igual em todo navegador.
        noValidate
        aria-label="Agendar mensagem"
        className="w-full max-w-md rounded-[var(--radius-2xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] p-6 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl"
      >
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <h3 className="inline-flex items-center gap-2 font-display text-[15px] font-semibold text-[var(--text-primary)]">
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]">
              <IconClock size={15} />
            </span>
            Agendar mensagem
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-sm)] p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
            aria-label="Fechar"
          >
            <IconX size={15} />
          </button>
        </div>

        {/* Mensagem */}
        <div className="mb-4">
          <label htmlFor={contentId} className={labelClass}>
            Mensagem
          </label>
          <Textarea
            id={contentId}
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            placeholder={
              file
                ? "Legenda do anexo (opcional)..."
                : "Escreva a mensagem a ser enviada..."
            }
          />
        </div>

        {/* Enviar em + anexo */}
        <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor={whenId} className={labelClass}>
              Enviar em
            </label>
            <input
              id={whenId}
              type="datetime-local"
              value={scheduledAt}
              min={toDateTimeLocalValue(new Date())}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept={SCHEDULE_ATTACHMENT_ACCEPT}
              aria-label="Arquivo do anexo"
              onChange={handleFileChange}
            />
            <ButtonGlass
              type="button"
              variant="glass"
              size="sm"
              className="h-[var(--input-height)]"
              onClick={() => fileInputRef.current?.click()}
              disabled={mutation.isPending}
            >
              <IconPaperclip size={14} />
              {file ? "Trocar anexo" : "Anexo"}
            </ButtonGlass>
          </div>
        </div>

        {file && (
          <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2 text-[12px]">
            <IconPaperclip size={14} className="shrink-0 text-[var(--text-muted)]" />
            <span className="min-w-0 truncate font-medium text-[var(--text-primary)]">
              {file.name}
            </span>
            <span className="shrink-0 text-[var(--text-muted)]">
              ({formatSize(file.size)})
            </span>
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remover anexo"
              className="ml-auto rounded-full p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--glass-bg-overlay)] hover:text-[var(--text-primary)]"
            >
              <IconX size={14} />
            </button>
          </div>
        )}

        {allowTemplateFallback && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-strong)] px-3 py-2.5 text-[12px]">
            <label htmlFor={fallbackId} className="flex cursor-pointer items-start gap-2.5">
              <input
                id={fallbackId}
                type="checkbox"
                checked={useFallback}
                onChange={(e) => {
                  const on = e.target.checked;
                  setUseFallback(on);
                  if (!on) setFallbackTemplate(null);
                }}
                className="mt-0.5 size-4 shrink-0 cursor-pointer rounded border-[var(--input-border)] accent-[var(--brand-primary)]"
              />
              <span className="flex-1">
                <span className="block font-semibold text-[var(--text-primary)]">
                  Usar template fallback se a sessão de 24h expirar
                </span>
                <span className="mt-0.5 block text-[var(--text-muted)]">
                  {useFallback
                    ? "Se a sessão de 24h estiver expirada no horário do envio, o template será usado em vez do texto livre."
                    : "Se a sessão expirar antes do envio, a mensagem será cancelada e você será notificado."}
                </span>
              </span>
            </label>

            {useFallback && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-6">
                {fallbackTemplate ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text-primary)]">
                      <IconFileText size={12} />
                      {fallbackTemplate.label || fallbackTemplate.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(true)}
                      className="text-[11px] font-medium text-[var(--brand-primary)] underline underline-offset-2 hover:opacity-80"
                    >
                      Trocar
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={chipButtonClass}
                  >
                    <IconFileText size={12} />
                    Escolher template fallback
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <p className="mb-5 text-[11px] leading-snug text-[var(--text-muted)]">
          O agendamento será cancelado automaticamente se o cliente responder
          ou se algum agente enviar mensagem antes do horário.
        </p>

        {/* Ações */}
        <div className="flex justify-end gap-2">
          <ButtonGlass type="button" variant="glass" onClick={onClose}>
            Cancelar
          </ButtonGlass>
          <ButtonGlass type="submit" variant="primary" disabled={!canSubmit}>
            {mutation.isPending ? "Agendando..." : "Agendar"}
          </ButtonGlass>
        </div>
      </form>

      {allowTemplateFallback && (
        <WhatsappTemplatePickerModal
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          conversationId={conversationId}
          channelId={channelId}
          contactName={contactName}
          onPick={(tpl) => setFallbackTemplate(fallbackTemplateFromPicker(tpl))}
        />
      )}
    </div>,
    document.body,
  );
}
