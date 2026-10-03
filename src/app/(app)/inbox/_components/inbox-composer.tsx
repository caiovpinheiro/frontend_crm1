"use client";

import { useState } from "react";

import { Composer } from "@/features/inbox-v2/extras";
import type { ComposerProps } from "@/features/inbox-v2/extras/composer/types";

type InboxComposerProps = Omit<ComposerProps, "value" | "onChange" | "onSend" | "onSendNote"> & {
  /** Envia; resolvido = enviado (o rascunho é limpo), rejeitado = mantém o texto. */
  onSend: (value: string) => Promise<unknown>;
  /** Salva a nota interna; resolvido = salvo (o rascunho é limpo). */
  onSendNote: (value: string) => Promise<unknown>;
};

/**
 * Composer do Inbox com o rascunho DENTRO dele (FE-1). Com o `draft` na
 * página, cada tecla re-renderizava a página inteira (lista, chat, aside).
 * Aqui a digitação só re-renderiza o composer; a página só fica sabendo
 * do texto no envio. Rascunho persistido e troca de conversa continuam no
 * `Composer` (`useComposerDraftPersistence`).
 */
export function InboxComposer({ onSend, onSendNote, ...props }: InboxComposerProps) {
  const [draft, setDraft] = useState("");

  async function handleSend(value: string) {
    await onSend(value);
    setDraft("");
  }

  function handleSendNote(value: string) {
    onSendNote(value).then(
      () => setDraft(""),
      () => {
        /* erro já avisado pela página; o texto fica para tentar de novo */
      },
    );
  }

  return (
    <Composer
      {...props}
      value={draft}
      onChange={setDraft}
      onSend={handleSend}
      onSendNote={handleSendNote}
    />
  );
}
