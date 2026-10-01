import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import {
  clearPendingComposerInsert,
  COMPOSER_INSERT_EVENT,
  takePendingComposerInsert,
  type ComposerInsertMedia,
  type ComposerInsertPayload,
} from "@/lib/composer-insert";
import type { PendingMedia } from "./types";

/**
 * Ponte: botões da lateral (ex. "Enviar produto") empurram texto (+ mídia)
 * pra cá sem prop-drilling pelo ContactAside.
 * No mobile o Chat pode estar desmontado (aba Negócio) — nesse caso o
 * payload fica em `takePendingComposerInsert` e é aplicado ao montar.
 */
function mediaFrom(list: ComposerInsertMedia[] | undefined): PendingMedia[] {
  return (list ?? [])
    .filter((m) => typeof m?.url === "string" && m.url.trim())
    .map((m) => ({
      url: m.url.trim(),
      name: m.name ?? null,
      mimeType: m.mimeType ?? null,
      sendBeforeText: Boolean(m.sendBeforeText),
    }));
}

export function useComposerInsertBridge({
  insertTemplateTextRef,
  draftRef,
  setPendingMediaList,
}: {
  insertTemplateTextRef: RefObject<(text: string) => void>;
  draftRef: RefObject<string>;
  setPendingMediaList: Dispatch<SetStateAction<PendingMedia[]>>;
}) {
  useEffect(() => {
    function applyInsert(payload: ComposerInsertPayload) {
      const steps = Array.isArray(payload?.steps) ? payload.steps : [];
      // Um ou mais produtos: o texto cai no campo, editável, e a imagem
      // fica encostada. O envio só acontece quando o operador confirma.
      const text =
        steps.length > 0
          ? steps
              .map((s) => (typeof s.text === "string" ? s.text.trim() : ""))
              .filter(Boolean)
              .join("\n\n")
          : typeof payload?.text === "string"
            ? payload.text
            : "";
      const media =
        steps.length > 0
          ? steps.flatMap((s) => mediaFrom(s.media))
          : mediaFrom(payload?.media);
      if (!text.trim() && media.length === 0) return;
      if (text.trim()) {
        const current = (draftRef.current || "").trimEnd();
        const incoming = text.trim();
        if (!(current === incoming || current.endsWith(incoming))) {
          insertTemplateTextRef.current(text);
        }
      }
      if (media.length > 0) {
        setPendingMediaList((prev) => {
          const urls = new Set(prev.map((m) => m.url));
          const extra = media.filter((m) => !urls.has(m.url));
          return extra.length > 0 ? [...prev, ...extra] : prev;
        });
      }
      clearPendingComposerInsert();
    }
    function onInsert(e: Event) {
      const detail = (e as CustomEvent<ComposerInsertPayload>).detail;
      applyInsert(detail ?? { text: "" });
    }
    window.addEventListener(COMPOSER_INSERT_EVENT, onInsert as EventListener);
    const pending = takePendingComposerInsert();
    if (pending) applyInsert(pending);
    return () => {
      window.removeEventListener(COMPOSER_INSERT_EVENT, onInsert as EventListener);
    };
    // Refs e setter estáveis: o efeito roda só na montagem, como quando
    // morava no corpo do Composer (deps `[]`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
