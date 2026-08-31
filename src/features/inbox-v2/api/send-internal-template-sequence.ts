/*
 * Envio sequencial de modelo interno com múltiplos anexos + mensagens
 * intercaladas (`messageBefore`). Compartilhado entre o picker de modelos
 * (menu "+"), o slash "/" e o park+Enter do composer — garante SEMPRE a
 * mesma ordem: content → anexo1 → messageBefore(anexo2) → anexo2 → ...
 *
 * Sequencial (await em loop) — NUNCA Promise.all — pra não estourar o rate
 * limit do canal quando o modelo tem vários arquivos. Falhas intermediárias
 * (messageBefore ou anexo) disparam toast e seguem para o próximo item —
 * não travam a sequência inteira nem falham 100% silenciosamente.
 */
import { toast } from "sonner";

import { ApiError } from "@/lib/api";
import { resolveChatMediaUrl } from "@/lib/chat-media-url";

import {
  isSessionClosedError,
  SESSION_CLOSED_TOAST,
} from "../extras/channel-switch-confirm";

import { sendAttachment, sendAttachmentReuse, sendMessage } from "./messages";

/** Um warn por aba — fallback é rede de segurança, não o happy path. */
let warnedReuseBlobFallback = false;

function isReuseMiss(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 404) return true;
    return (
      err.status === 400 &&
      /URL de mídia inválida|não encontrado/i.test(err.message)
    );
  }
  return err instanceof Error && /não encontrado no storage/i.test(err.message);
}

/** Mesmo GET que o card de mídia (api.bwipo.com) — cookie viaja. */
async function fetchTemplateMediaBlob(url: string): Promise<Blob> {
  const resolved = resolveChatMediaUrl(url) ?? url;
  const res = await fetch(resolved, { credentials: "include", cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Não foi possível baixar a mídia do modelo (${res.status})`);
  }
  const blob = await res.blob();
  if (!blob.size) {
    throw new Error("Mídia do modelo veio vazia");
  }
  return blob;
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
  /** Texto enviado ANTES deste arquivo (só faz sentido para índice >= 1). */
  messageBefore?: string | null;
}

/** Multi-anexo ou `messageBefore` no 2º+ exige a sequência imediata. */
export function mediaNeedsSequence(
  media: Array<{ url: string; name: string | null; messageBefore?: string | null }>,
): boolean {
  return (
    media.length > 1 ||
    media.some((m, i) => i >= 1 && !!m.messageBefore?.trim())
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
      await sendMessage(conversationId, { content: trimmedContent, channelId });
    } catch (err) {
      toastSendError(err, "Falha ao enviar mensagem do modelo");
    }
  }

  for (let i = 0; i < attachments.length; i++) {
    const att = attachments[i];

    // A partir do 2º anexo, `messageBefore` (se preenchido) sai como
    // mensagem de texto própria imediatamente antes do arquivo correspondente.
    if (i > 0 && att.messageBefore?.trim()) {
      try {
        await sendMessage(conversationId, {
          content: att.messageBefore.trim(),
          channelId,
        });
      } catch (err) {
        toastSendError(err, "Falha ao enviar mensagem antes do anexo");
      }
    }

    try {
      await sendAttachmentReuse(conversationId, {
        reuseUrl: att.url,
        fileName: att.name ?? undefined,
        channelId,
      });
    } catch (err) {
      if (!isReuseMiss(err)) {
        toastSendError(err, `Falha ao enviar anexo${att.name ? ` "${att.name}"` : ""}`);
        continue;
      }
      // Reuse 404 (Spaces Head/Get flaky, key .jpg/.jpeg, GET só via
      // rewrite/upstream) — baixa o blob pelo mesmo GET do card e sobe
      // multipart. Só este anexo; reuse 201 não passa por aqui.
      if (!warnedReuseBlobFallback) {
        warnedReuseBlobFallback = true;
        console.warn(
          "[inbox] reuseUrl falhou — fallback blob→multipart para este anexo",
          att.name ?? att.url,
        );
      }
      try {
        const blob = await fetchTemplateMediaBlob(att.url);
        await sendAttachment(conversationId, blob, {
          fileName: att.name ?? undefined,
          channelId,
        });
      } catch (fallbackErr) {
        toastSendError(
          fallbackErr,
          `Falha ao enviar anexo${att.name ? ` "${att.name}"` : ""}`,
        );
      }
    }
  }
}
