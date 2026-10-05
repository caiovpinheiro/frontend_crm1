import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { sendAttachmentReuse, sendMessage } from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches, messagesKey } from "@/features/inbox-v2/hooks";
import type { ComposerInsertStep } from "@/lib/composer-insert";

import { WHATSAPP_IMAGE_CAPTION_MAX } from "./attachment-helpers";

/**
 * Um produto = uma mensagem (imagem com legenda, se o texto couber).
 * A grade curricular, quando existe, sai depois do texto daquele produto.
 */
export async function sendProductSteps({
  conversationId,
  channelId,
  steps,
  qc,
  applySignature,
}: {
  conversationId: string;
  channelId?: string | null;
  steps: ComposerInsertStep[];
  qc: QueryClient;
  applySignature?: (text: string) => string;
}): Promise<void> {
  let sent = 0;
  for (const step of steps) {
    const text = (applySignature?.(step.text) ?? step.text).trim();
    const media = (step.media ?? []).filter((m) => m.url?.trim());
    const before = media.filter((m) => m.sendBeforeText);
    const after = media.filter((m) => !m.sendBeforeText);
    const cover = before[0];
    const extraBefore = before.slice(1);
    try {
      if (cover && text && text.length <= WHATSAPP_IMAGE_CAPTION_MAX) {
        await sendAttachmentReuse(conversationId, {
          reuseUrl: cover.url,
          fileName: cover.name ?? undefined,
          mimeType: cover.mimeType ?? undefined,
          caption: text,
          channelId,
          waitUntilSent: true,
        });
        sent += 1;
      } else {
        if (cover) {
          await sendAttachmentReuse(conversationId, {
            reuseUrl: cover.url,
            fileName: cover.name ?? undefined,
            mimeType: cover.mimeType ?? undefined,
            channelId,
            waitUntilSent: true,
          });
          sent += 1;
        }
        if (text) {
          await sendMessage(conversationId, {
            content: text,
            channelId,
            waitUntilSent: true,
          });
          sent += 1;
        }
      }
      for (const m of extraBefore) {
        await sendAttachmentReuse(conversationId, {
          reuseUrl: m.url,
          fileName: m.name ?? undefined,
          mimeType: m.mimeType ?? undefined,
          channelId,
          waitUntilSent: true,
        });
        sent += 1;
      }
      for (const m of after) {
        await sendAttachmentReuse(conversationId, {
          reuseUrl: m.url,
          fileName: m.name ?? undefined,
          mimeType: m.mimeType ?? undefined,
          channelId,
          waitUntilSent: true,
        });
        sent += 1;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao enviar um dos produtos.");
    }
  }
  if (sent > 0) {
    qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    const lastText = [...steps].reverse().map((s) => s.text.trim()).find(Boolean);
    if (lastText) {
      applyOutboundPreviewToInboxCaches(qc, conversationId, { content: lastText });
    }
  }
}
