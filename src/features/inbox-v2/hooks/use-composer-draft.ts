"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  COMPOSER_DRAFT_WRITE_DEBOUNCE_MS,
  readComposerDraft,
  subscribeComposerDraft,
  writeComposerDraft,
} from "../composer-draft";

/**
 * Liga um composer controlado (`value`/`onChange`) ao rascunho persistido
 * em `localStorage` (ver `composer-draft.ts`):
 *
 * - ao montar / trocar de conversa, restaura o texto salvo (se houver);
 *   trocar de conversa sem rascunho salvo começa em branco — o texto da
 *   anterior fica guardado na chave dela, não vaza para a próxima;
 * - grava a cada pausa de digitação (debounce) e no `pagehide`/unmount;
 * - texto vazio (enviou, apagou) remove a chave;
 * - outra aba gravando a mesma conversa atualiza esta, desde que o
 *   operador não esteja com o campo focado aqui (`isEditing`) — quem está
 *   digitando nunca é sobrescrito.
 *
 * `storageKey === null` (sessão ainda carregando, sem conversa) desliga
 * tudo sem efeito colateral.
 */
export function useComposerDraftPersistence(opts: {
  storageKey: string | null;
  value: string;
  onChange: (value: string) => void;
  isEditing: () => boolean;
}): void {
  const { storageKey, value, onChange, isEditing } = opts;
  const onChangeRef = useRef(onChange);
  const isEditingRef = useRef(isEditing);
  const valueRef = useRef(value);
  // Espelhos lidos só em efeitos e callbacks (nunca no render); sincronizados
  // a cada commit, antes dos efeitos abaixo (ordem de declaração).
  useEffect(() => {
    onChangeRef.current = onChange;
    isEditingRef.current = isEditing;
    valueRef.current = value;
  });

  const pendingRef = useRef<{ key: string; value: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Chave cujo restore ainda não foi refletido em `value` (render vazio). */
  const awaitingRestoreRef = useRef<string | null>(null);
  const prevKeyRef = useRef<string | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    writeComposerDraft(pending.key, pending.value);
  }, []);

  // Restaura ao montar / trocar de conversa. Grava antes o que ficou
  // pendente da conversa anterior (o onChange abaixo trocaria o pending).
  useEffect(() => {
    const prevKey = prevKeyRef.current;
    prevKeyRef.current = storageKey;
    flush();
    awaitingRestoreRef.current = null;
    if (!storageKey) return;
    const saved = readComposerDraft(storageKey);
    if (saved) {
      awaitingRestoreRef.current = storageKey;
      if (saved !== valueRef.current) onChangeRef.current(saved);
      return;
    }
    // Conversa nova sem rascunho: não herda o texto da anterior (já gravado
    // na chave dela pelo flush acima). Sessão carregando (null → chave)
    // não conta como troca.
    if (prevKey && prevKey !== storageKey && valueRef.current) {
      onChangeRef.current("");
    }
  }, [storageKey, flush]);

  // Persiste (debounce). O render vazio que antecede o restore não pode
  // apagar o rascunho salvo — espera o `value` refletir o texto.
  useEffect(() => {
    if (!storageKey) return;
    if (awaitingRestoreRef.current === storageKey) {
      if (!value) return;
      awaitingRestoreRef.current = null;
    }
    pendingRef.current = { key: storageKey, value };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, COMPOSER_DRAFT_WRITE_DEBOUNCE_MS);
  }, [storageKey, value, flush]);

  // Fechar/recarregar a aba e desmontar gravam o que estiver pendente.
  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // Outra aba gravou esta conversa.
  useEffect(() => {
    if (!storageKey) return;
    return subscribeComposerDraft(storageKey, (text) => {
      if (text === valueRef.current) return;
      if (isEditingRef.current()) return;
      // O texto que chega já está no storage: não regrava o pendente local.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current = null;
      awaitingRestoreRef.current = null;
      onChangeRef.current(text);
    });
  }, [storageKey]);
}
