import type { Dispatch, RefObject, SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  sendAttachment,
  sendAttachmentReuse,
  sendInternalTemplateSequence,
} from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches, messagesKey } from "@/features/inbox-v2/hooks";
import { WHATSAPP_IMAGE_CAPTION_MAX } from "./attachment-helpers";
import type { ComposerProps, PendingFile, PendingMedia } from "./types";

/**
 * Envio do que está encostado no composer (mídia de modelo, arquivos e
 * texto), na ordem certa. Não usa hooks: é chamada a cada render do
 * Composer, como as closures que substitui.
 */
export function useOutboundFlush({
  conversationId,
  selectedChannelId,
  qc,
  onChange,
  onSend,
  draftRef,
  pendingMediaListRef,
  setPendingMediaList,
  pendingFilesRef,
  setPendingFiles,
  setSequenceSending,
}: {
  conversationId: ComposerProps["conversationId"];
  selectedChannelId: ComposerProps["selectedChannelId"];
  qc: QueryClient;
  onChange: ComposerProps["onChange"];
  onSend: ComposerProps["onSend"];
  draftRef: RefObject<string>;
  pendingMediaListRef: RefObject<PendingMedia[]>;
  setPendingMediaList: Dispatch<SetStateAction<PendingMedia[]>>;
  pendingFilesRef: RefObject<PendingFile[]>;
  setPendingFiles: Dispatch<SetStateAction<PendingFile[]>>;
  setSequenceSending: Dispatch<SetStateAction<boolean>>;
}) {
  // Envia os anexos encostados (mídia de modelo/mensagem rápida) logo após o
  // texto do Enter — via o helper compartilhado (SEQUENCIAL, com toast em
  // falha intermediária). Lê de `pendingMediaListRef` (não do state direto)
  // pra evitar stale closure entre o render que agendou e o flush em si.
  async function flushPendingMedia(beforeText: boolean) {
    const all = pendingMediaListRef.current;
    const list = all.filter((m) => Boolean(m.sendBeforeText) === beforeText);
    if (list.length === 0 || !conversationId) return;
    const remaining = all.filter((m) => Boolean(m.sendBeforeText) !== beforeText);
    setPendingMediaList(remaining);
    pendingMediaListRef.current = remaining;
    await sendInternalTemplateSequence({
      conversationId,
      content: "",
      attachments: list,
      channelId: selectedChannelId,
    });
  }

  // Envia os arquivos encostados, um a um, na ordem. `caption` (texto do
  // composer) vai na legenda do PRIMEIRO arquivo — igual ao WhatsApp. Limpa
  // o estado e revoga as URLs de preview ao final.
  async function flushNoteFiles(caption?: string) {
    const files = pendingFilesRef.current;
    if (files.length === 0 || !conversationId) return;
    setPendingFiles([]);
    pendingFilesRef.current = [];
    let failed = 0;
    for (const [index, f] of files.entries()) {
      try {
        await sendAttachment(conversationId, f.file, {
          fileName: f.name,
          asNote: true,
          ...(index === 0 && caption ? { caption } : {}),
        });
      } catch {
        failed += 1;
      }
    }
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    if (failed > 0) {
      toast.error(
        failed === 1 ? "Falha ao anexar 1 arquivo na nota" : `Falha ao anexar ${failed} arquivos na nota`,
      );
    }
  }

  async function flushPendingFiles(caption?: string) {
    const files = pendingFilesRef.current;
    if (files.length === 0 || !conversationId) return;
    setPendingFiles([]);
    pendingFilesRef.current = [];
    let failed = 0;
    for (const [index, f] of files.entries()) {
      try {
        await sendAttachment(conversationId, f.file, {
          fileName: f.name,
          channelId: selectedChannelId,
          ...(index === 0 && caption ? { caption } : {}),
        });
      } catch {
        failed += 1;
      }
    }
    files.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl);
    });
    qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
    if (failed > 0) {
      toast.error(
        failed === 1 ? "Falha ao enviar 1 anexo" : `Falha ao enviar ${failed} anexos`,
      );
    }
  }

  // Limite de caption de imagem na WhatsApp Cloud API.

  async function flushOutbound(text: string | null) {
    const all = pendingMediaListRef.current;
    const before = all.filter((m) => Boolean(m.sendBeforeText));
    const captionText = text?.trim() ?? "";
    const canCaption =
      Boolean(conversationId) &&
      before.length > 0 &&
      captionText.length > 0 &&
      captionText.length <= WHATSAPP_IMAGE_CAPTION_MAX;

    if (canCaption && conversationId) {
      const remaining = all.filter((m) => !m.sendBeforeText);
      setPendingMediaList(remaining);
      pendingMediaListRef.current = remaining;
      onChange("");
      draftRef.current = "";
      setSequenceSending(true);
      try {
        const [first, ...rest] = before;
        await sendAttachmentReuse(conversationId, {
          reuseUrl: first.url,
          fileName: first.name ?? undefined,
          mimeType: first.mimeType ?? undefined,
          caption: captionText,
          channelId: selectedChannelId,
          waitUntilSent: true,
        });
        for (const m of rest) {
          await sendAttachmentReuse(conversationId, {
            reuseUrl: m.url,
            fileName: m.name ?? undefined,
            mimeType: m.mimeType ?? undefined,
            channelId: selectedChannelId,
            waitUntilSent: true,
          });
        }
        qc.invalidateQueries({ queryKey: messagesKey(conversationId) });
        applyOutboundPreviewToInboxCaches(qc, conversationId, {
          content: captionText,
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao enviar imagem com legenda.");
      } finally {
        setSequenceSending(false);
      }
    } else {
      // Arquivo encostado (arrastado / anexado / colado) + texto curto: o
      // texto vira legenda do primeiro arquivo, em vez de sair como
      // mensagem separada antes dele.
      const filesTakeCaption =
        Boolean(conversationId) &&
        before.length === 0 &&
        pendingFilesRef.current.length > 0 &&
        captionText.length > 0 &&
        captionText.length <= WHATSAPP_IMAGE_CAPTION_MAX;
      if (filesTakeCaption && conversationId) {
        onChange("");
        draftRef.current = "";
        setSequenceSending(true);
        try {
          await flushPendingFiles(captionText);
          applyOutboundPreviewToInboxCaches(qc, conversationId, {
            content: captionText,
          });
        } finally {
          setSequenceSending(false);
        }
        await flushPendingMedia(false);
        return;
      }
      if (
        (before.length > 0 || pendingFilesRef.current.length > 0) &&
        captionText.length > WHATSAPP_IMAGE_CAPTION_MAX
      ) {
        toast.message(
          "Texto longo demais para legenda do WhatsApp; enviando arquivo e texto separados.",
        );
      }
      await flushPendingMedia(true);
      if (text) {
        try {
          await Promise.resolve(onSend(text));
        } catch {
          /* texto falhou; ainda tenta anexos se o caller não bloqueou */
        }
      }
    }
    await flushPendingMedia(false);
    await flushPendingFiles();
  }

  return { flushPendingMedia, flushPendingFiles, flushNoteFiles, flushOutbound };
}
