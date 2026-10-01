import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";

import {
  clearPendingComposerInsert,
  COMPOSER_INSERT_EVENT,
  takePendingComposerInsert,
  type ComposerInsertPayload,
  type ComposerInsertStep,
} from "@/lib/composer-insert";
import type { PendingMedia } from "./types";

/**
 * Ponte: botões da lateral (ex. "Enviar produto") empurram texto (+ mídia)
 * pra cá sem prop-drilling pelo ContactAside.
 * No mobile o Chat pode estar desmontado (aba Negócio) — nesse caso o
 * payload fica em `takePendingComposerInsert` e é aplicado ao montar.
 */
export function useComposerInsertBridge({
  insertTemplateTextRef,
  sendProductOfferStepsRef,
  draftRef,
  setPendingMediaList,
}: {
  insertTemplateTextRef: RefObject<(text: string) => void>;
  sendProductOfferStepsRef: RefObject<(steps: ComposerInsertStep[]) => Promise<void>>;
  draftRef: RefObject<string>;
  setPendingMediaList: Dispatch<SetStateAction<PendingMedia[]>>;
}) {
  useEffect(() => {
    function applyInsert(payload: ComposerInsertPayload) {
      const steps = Array.isArray(payload?.steps) ? payload.steps : [];
      const productIds = Array.isArray(payload?.productIds)
        ? payload.productIds.filter((id) => typeof id === "string" && id.trim())
        : steps
            .map((s) => s.productId)
            .filter((id): id is string => Boolean(id));
      if (steps.length > 1 || productIds.length > 0) {
        clearPendingComposerInsert();
        const resolvedSteps =
          steps.length > 0
            ? steps
            : [
                {
                  text: typeof payload?.text === "string" ? payload.text : "",
                  media: payload?.media,
                  productId: productIds[0],
                },
              ];
        if (productIds.length > 0 && !resolvedSteps.some((s) => s.productId)) {
          resolvedSteps.forEach((s, i) => {
            if (!s.productId && productIds[i]) s.productId = productIds[i];
          });
        }
        void sendProductOfferStepsRef.current(resolvedSteps);
        return;
      }
      const text = typeof payload?.text === "string" ? payload.text : "";
      const media = Array.isArray(payload?.media)
        ? payload.media
            .filter((m) => typeof m?.url === "string" && m.url.trim())
            .map((m) => ({
              url: m.url.trim(),
              name: m.name ?? null,
              mimeType: m.mimeType ?? null,
              sendBeforeText: Boolean(m.sendBeforeText),
            }))
        : [];
      if (!text.trim() && media.length === 0) return;
      if (text.trim()) {
        const current = (draftRef.current || "").trimEnd();
        const incoming = text.trim();
        if (!(current === incoming || current.endsWith(incoming))) {
          insertTemplateTextRef.current(text);
        }
      }
      if (media.length > 0) {
        setPendingMediaList((prev) => [...prev, ...media]);
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
