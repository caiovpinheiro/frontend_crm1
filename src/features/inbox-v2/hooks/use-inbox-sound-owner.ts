"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  INBOX_AUDIO_UNLOCKED_EVENT,
  isInboxAudioRunning,
} from "./use-inbox-sound";

/**
 * Uma aba só toca o bip do inbox: a dona do Web Lock `lockName`
 * (`inbox-sound:<org>:<user>`). Sem isto cada aba aberta do CRM tocava o
 * mesmo aviso — o debounce do ping é por aba.
 *
 * - Só disputa com o áudio destravado: aba travada não pode tocar, então
 *   não pode segurar o lock.
 * - Ao ganhar foco a aba pede com `steal: true` — o som sai de onde o
 *   operador está. A aba roubada volta para a fila e reassume quando a
 *   dona fecha.
 * - Sem Web Locks toda aba é dona (comportamento anterior).
 *
 * Devolve `isOwner()` para ler no handler do SSE (ref, sem re-render).
 */
export function useInboxSoundOwner(lockName: string | null): {
  isOwner: () => boolean;
  /** `true` se outra aba segura o lock agora. */
  heldElsewhere: () => Promise<boolean>;
} {
  const ownerRef = useRef(false);

  useEffect(() => {
    if (!lockName) return;
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) {
      ownerRef.current = true;
      return () => {
        ownerRef.current = false;
      };
    }

    let disposed = false;
    // Cada pedido tem uma geração; resposta de pedido superado é ignorada.
    let generation = 0;
    let queued: AbortController | null = null;
    let release: (() => void) | null = null;

    const acquire = (steal: boolean) => {
      if (disposed || ownerRef.current || !isInboxAudioRunning()) return;
      if (!steal && queued) return;
      queued?.abort();
      queued = null;
      const mine = ++generation;
      const abort = steal ? null : new AbortController();
      queued = abort;
      // `steal` não aceita `signal`: o pedido com roubo não fica na fila.
      const options: LockOptions = abort ? { signal: abort.signal } : { steal: true };
      locks
        .request(lockName, options, () => {
          if (disposed || mine !== generation) return undefined;
          queued = null;
          ownerRef.current = true;
          return new Promise<void>((resolve) => {
            release = resolve;
          });
        })
        .catch(() => {
          // AbortError: fila cancelada por nós, ou o lock foi roubado.
          if (disposed || mine !== generation) return;
          ownerRef.current = false;
          release = null;
          queued = null;
          acquire(false);
        });
    };

    const onFocus = () => acquire(true);
    const onUnlocked = () => acquire(document.hasFocus());

    acquire(document.hasFocus());
    window.addEventListener("focus", onFocus);
    window.addEventListener(INBOX_AUDIO_UNLOCKED_EVENT, onUnlocked);
    return () => {
      disposed = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(INBOX_AUDIO_UNLOCKED_EVENT, onUnlocked);
      queued?.abort();
      release?.();
      ownerRef.current = false;
    };
  }, [lockName]);

  const isOwner = useCallback(() => ownerRef.current, []);

  const heldElsewhere = useCallback(async () => {
    if (!lockName || ownerRef.current) return false;
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    if (!locks) return false;
    try {
      const snapshot = await locks.query();
      return (snapshot.held ?? []).some((l) => l.name === lockName);
    } catch {
      return false;
    }
  }, [lockName]);

  return { isOwner, heldElsewhere };
}
