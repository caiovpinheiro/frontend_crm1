import { useRef, type Dispatch, type SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { sendAttachmentReuse, sendConversationProducts } from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches } from "@/features/inbox-v2/hooks";
import type { ComposerInsertStep } from "@/lib/composer-insert";
import { WHATSAPP_IMAGE_CAPTION_MAX } from "./attachment-helpers";
import type { ComposerProps } from "./types";

/**
 * Envio de produtos pela lateral ("Enviar produto"): tenta o catálogo
 * WhatsApp (produto único / carrossel) e cai para imagem + legenda por
 * passo. Devolve a função de envio (recriada a cada render, como antes).
 */
export function useProductOfferSender({
  conversationId,
  selectedChannelId,
  qc,
  applySignature,
  onSend,
  setSequenceSending,
}: {
  conversationId: ComposerProps["conversationId"];
  selectedChannelId: ComposerProps["selectedChannelId"];
  qc: QueryClient;
  applySignature: (text: string) => string;
  onSend: ComposerProps["onSend"];
  setSequenceSending: Dispatch<SetStateAction<boolean>>;
}) {
  const productSendLock = useRef(false);
  async function sendProductOfferSteps(steps: ComposerInsertStep[]) {
    const cid = conversationId;
    if (!cid) {
      toast.error("Abra a conversa para enviar os produtos.");
      return;
    }
    if (productSendLock.current) return;
    productSendLock.current = true;
    setSequenceSending(true);
    try {
      const productIds = steps
        .map((s) => s.productId?.trim())
        .filter((id): id is string => Boolean(id));
      if (productIds.length > 0) {
        try {
          let result = await sendConversationProducts(cid, {
            productIds,
            format: "auto",
            header: "Produtos",
            channelId: selectedChannelId,
          });
          if (result.used === "ask") {
            result = await sendConversationProducts(cid, {
              productIds,
              format:
                productIds.length <= 1
                  ? "catalog_product"
                  : "catalog_product_list",
              header: "Produtos",
              channelId: selectedChannelId,
            });
          }
          if (result.used === "catalog") {
            applyOutboundPreviewToInboxCaches(qc, cid, {
              content:
                productIds.length <= 1
                  ? "Produto enviado no catálogo WhatsApp"
                  : "Carrossel de produtos enviado no WhatsApp",
            });
            toast.success(
              productIds.length <= 1
                ? "Produto enviado no catálogo WhatsApp."
                : "Carrossel de produtos enviado no WhatsApp.",
            );
            return;
          }
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Falha ao enviar no catálogo Meta.",
          );
          return;
        }
      }
      for (const step of steps) {
        const captionText = applySignature(step.text.trim());
        const media = (step.media ?? []).find(
          (m) => typeof m.url === "string" && m.url.trim(),
        );
        try {
          if (media) {
            const reuseUrl = media.url.trim();
            if (
              captionText.length > 0 &&
              captionText.length <= WHATSAPP_IMAGE_CAPTION_MAX
            ) {
              await sendAttachmentReuse(cid, {
                reuseUrl,
                fileName: media.name ?? undefined,
                mimeType: media.mimeType ?? undefined,
                caption: captionText,
                channelId: selectedChannelId,
                waitUntilSent: true,
                deferChatUntilSent: true,
              });
            } else {
              if (captionText.length > WHATSAPP_IMAGE_CAPTION_MAX) {
                toast.message(
                  "Texto longo demais para legenda do WhatsApp; enviando imagem e texto separados.",
                );
              }
              await sendAttachmentReuse(cid, {
                reuseUrl,
                fileName: media.name ?? undefined,
                mimeType: media.mimeType ?? undefined,
                channelId: selectedChannelId,
                waitUntilSent: true,
                deferChatUntilSent: true,
              });
              if (captionText) {
                await Promise.resolve(onSend(captionText));
              }
            }
          } else if (captionText) {
            await Promise.resolve(onSend(captionText));
          }
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Falha ao enviar um dos produtos.",
          );
        }
      }
      applyOutboundPreviewToInboxCaches(qc, cid, {
        content: steps[steps.length - 1]?.text?.trim() || "produto",
      });
    } finally {
      productSendLock.current = false;
      setSequenceSending(false);
    }
  }

  return sendProductOfferSteps;
}
