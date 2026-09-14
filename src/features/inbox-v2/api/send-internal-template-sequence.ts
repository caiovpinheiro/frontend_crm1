/*
 * Envio sequencial de modelo interno com múltiplos anexos + mensagens
 * intercaladas (`messageBefore`). Compartilhado entre o picker de modelos
 * (menu "+"), o slash "/" e o park+Enter do composer — garante SEMPRE a
 * mesma ordem: content → (texto do passo + arquivo, se houver) × N.
 * Cada POST espera o worker Meta (`waitUntilSent`) para a Graph não
 * entregar todos os textos (fila outbound) antes das imagens (fila attach).
 *
 * Sequencial (await em loop) — NUNCA Promise.all — pra não estourar o rate
 * limit do canal quando o modelo tem vários arquivos. Falhas intermediárias
 * (messageBefore ou anexo) disparam toast e seguem para o próximo item —
 * não travam a sequência inteira nem falham 100% silenciosamente.
 *
 * Mídia: só reuseUrl. O GET do player 404 é o mesmo objeto ausente —
 * baixar o blob e subir multipart só pendura a UI. Miss → toast e para.
 */
import { toast } from "sonner";

import { ApiError } from "@/lib/api";

import {
  isSessionClosedError,
  SESSION_CLOSED_TOAST,
} from "../extras/channel-switch-confirm";

import { sendAttachmentReuse, sendMessage } from "./messages";

export const TEMPLATE_MEDIA_MISSING_TOAST =
  "Mídia do modelo não está no storage. Abra o modelo e envie o arquivo de novo.";

export const WHATSAPP_VIDEO_TOO_LARGE_TOAST =
  "Vídeo acima do limite de 16 MB da WhatsApp Cloud API. Compacte o arquivo ou envie um vídeo menor.";

export class TemplateMediaMissingError extends Error {
  readonly code = "TEMPLATE_MEDIA_MISSING";
  readonly toasted = true;
  constructor(message = TEMPLATE_MEDIA_MISSING_TOAST) {
    super(message);
    this.name = "TemplateMediaMissingError";
  }
}

function isReuseMiss(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 404) return true;
    return (
      err.status === 400 &&
      /URL de mídia inválida|não encontrado|não está no storage/i.test(err.message)
    );
  }
  return err instanceof Error && /não encontrado no storage|não está no storage/i.test(err.message);
}

function isVideoTooLarge(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.code === "WHATSAPP_VIDEO_TOO_LARGE") return true;
    return err.status === 413 && /16 MB|WhatsApp Cloud API/i.test(err.message);
  }
  return err instanceof Error && /16 MB.*WhatsApp Cloud API/i.test(err.message);
}

function reuseMissMessage(err: unknown): string {
  if (err instanceof ApiError && err.message.trim()) return err.message;
  if (err instanceof Error && err.message.trim()) return err.message;
  return TEMPLATE_MEDIA_MISSING_TOAST;
}

// 409 SESSION_CLOSED (sessão expirou no meio da sequência) ganha o aviso
// padronizado em vez da mensagem crua do backend.
function toastSendError(err: unknown, fallback: string) {
  toast.error(
    isSessionClosedError(err)
      ? SESSION_CLOSED_TOAST
      : err instanceof Error
        ? err.message
        : fallback,
  );
}

export interface InternalTemplateSequenceAttachment {
  url: string;
  name: string | null;
  mimeType?: string | null;
  /** Texto deste passo (antes do arquivo, se houver). */
  messageBefore?: string | null;
}

/** Mais de um passo, texto extra ou item só de texto → envio em sequência. */
export function mediaNeedsSequence(
  media: Array<{ url: string; name: string | null; messageBefore?: string | null }>,
): boolean {
  return (
    media.length > 1 ||
    media.some((m) => !!m.messageBefore?.trim()) ||
    media.some((m) => !String(m.url ?? "").trim())
  );
}

export async function sendInternalTemplateSequence({
  conversationId,
  content,
  attachments,
  channelId,
}: {
  conversationId: string;
  content?: string | null;
  attachments: InternalTemplateSequenceAttachment[];
  /** Override de canal de saída (org com >1 WhatsApp conectado). */
  channelId?: string | null;
}): Promise<void> {
  const trimmedContent = (content ?? "").trim();
  if (trimmedContent) {
    try {
      await sendMessage(conversationId, {
        content: trimmedContent,
        channelId,
        waitUntilSent: true,
      });
    } catch (err) {
      toastSendError(err, "Falha ao enviar mensagem do modelo");
    }
  }

  for (const att of attachments) {
    if (att.messageBefore?.trim()) {
      try {
        await sendMessage(conversationId, {
          content: att.messageBefore.trim(),
          channelId,
          waitUntilSent: true,
        });
      } catch (err) {
        toastSendError(err, "Falha ao enviar mensagem da sequência");
      }
    }

    if (!att.url?.trim()) continue;

    try {
      await sendAttachmentReuse(conversationId, {
        reuseUrl: att.url,
        fileName: att.name ?? undefined,
        mimeType: att.mimeType ?? undefined,
        channelId,
        waitUntilSent: true,
      });
    } catch (err) {
      if (isVideoTooLarge(err)) {
        const message =
          err instanceof Error && err.message.trim()
            ? err.message
            : WHATSAPP_VIDEO_TOO_LARGE_TOAST;
        toast.error(message);
        throw new TemplateMediaMissingError(message);
      }
      if (isReuseMiss(err)) {
        const message = reuseMissMessage(err);
        toast.error(message);
        throw new TemplateMediaMissingError(message);
      }
      toastSendError(err, `Falha ao enviar anexo${att.name ? ` "${att.name}"` : ""}`);
    }
  }
}
