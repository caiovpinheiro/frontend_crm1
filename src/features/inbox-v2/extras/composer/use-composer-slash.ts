import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { QueryClient } from "@tanstack/react-query";

import { useSlashMenu } from "@/components/inbox/slash-command-menu";
import { mediaNeedsSequence, sendInternalTemplateSequence } from "@/features/inbox-v2/api";
import { applyOutboundPreviewToInboxCaches, messagesKey } from "@/features/inbox-v2/hooks";
import type { InternalTemplateContext } from "@/lib/internal-template-variables";
import { slashTemplateToPending, type PendingTemplate } from "../template-compose-panel";
import type { ComposerProps, PendingMedia } from "./types";

/** Menu "/" do composer: modelos internos, templates Meta e automações. */
export function useComposerSlash({
  value,
  onChange,
  draftRef,
  textareaRef,
  rootRef,
  templateContext,
  conversationId,
  contactId,
  dealId,
  selectedChannelId,
  conversationChannelId,
  disabled,
  noteMode,
  qc,
  setSequenceSending,
  setPendingMediaList,
  setPendingTemplate,
}: Pick<
  ComposerProps,
  | "value"
  | "onChange"
  | "conversationId"
  | "contactId"
  | "dealId"
  | "selectedChannelId"
  | "conversationChannelId"
  | "disabled"
> & {
  draftRef: RefObject<string>;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  rootRef: RefObject<HTMLDivElement | null>;
  templateContext: InternalTemplateContext;
  noteMode: boolean;
  qc: QueryClient;
  setSequenceSending: Dispatch<SetStateAction<boolean>>;
  setPendingMediaList: Dispatch<SetStateAction<PendingMedia[]>>;
  setPendingTemplate: Dispatch<SetStateAction<PendingTemplate | null>>;
}) {
  // ── Slash command (/modelos) ────────────────────────────────────
  // Modelo interno → o hook insere o texto interpolado no campo (editável).
  // Template Meta → abre o painel de validação.
  // Wrapper de `setDraft` para o slash menu: atualiza `draftRef`
  // SINCRONAMENTE antes de propagar pro estado do pai. O slash chama
  // `setDraft(next)` e, logo em seguida (ainda síncrono), `onInsertMedia` —
  // por isso `draftRef.current` já reflete o texto novo quando
  // `onInsertMedia` roda, mesmo a prop `value` só atualizando no próximo render.
  function handleSlashDraftChange(next: string) {
    draftRef.current = next;
    onChange(next);
  }

  const slash = useSlashMenu({
    draft: value,
    setDraft: handleSlashDraftChange,
    textareaRef,
    templateContext,
    // Conversa/contato atuais — habilitam a seção "Automações" no menu "/".
    conversationId,
    contactId,
    dealId,
    channelId: selectedChannelId ?? conversationChannelId ?? null,
    // Desabilita o atalho em modo nota (não faz sentido inserir templates ali)
    disabled: disabled || noteMode,
    // Modelo/mensagem rápida com anexo — 1 anexo sem messageBefore encosta
    // pra ir junto no Enter (editável); multi-anexo ou messageBefore>=1
    // exige a SEQUÊNCIA imediata (texto já está em `draftRef` — ver acima).
    onInsertMedia: (media) => {
      const list = Array.isArray(media) ? media : [media];
      if (mediaNeedsSequence(list) && conversationId) {
        const targetConversationId = conversationId;
        // `queueMicrotask` garante que rodamos após o restante do handler
        // síncrono do slash (setDraft já rodou, `draftRef` já está fresco).
        queueMicrotask(() => {
          const text = draftRef.current;
          onChange("");
          draftRef.current = "";
          setSequenceSending(true);
          void (async () => {
            try {
              await sendInternalTemplateSequence({
                conversationId: targetConversationId,
                content: text,
                attachments: list,
              });
              qc.invalidateQueries({ queryKey: messagesKey(targetConversationId) });
              applyOutboundPreviewToInboxCaches(qc, targetConversationId, {
                content: text,
              });
            } finally {
              setSequenceSending(false);
            }
          })();
        });
        return;
      }
      setPendingMediaList((prev) => [...prev, ...list]);
    },
    onPickMetaTemplate: (item) => setPendingTemplate(slashTemplateToPending(item)),
  });

  // Fechar o slash menu via ESC (mesmo sem foco no textarea) e ao clicar
  // fora do composer — o hook só fecha por teclado com o textarea focado.
  useEffect(() => {
    if (!slash.state.open) return;
    function onEsc(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") slash.close();
    }
    function onPointer(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        slash.close();
      }
    }
    document.addEventListener("keydown", onEsc);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [slash.state.open, slash.close]);

  return slash;
}
