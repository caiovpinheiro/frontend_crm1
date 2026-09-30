"use client";

import { useCallback, useEffect, useRef } from "react";

import {
  createSoundOwnerElection,
  type SoundOwnerElection,
} from "./sound-owner-election";
import {
  INBOX_AUDIO_UNLOCKED_EVENT,
  isInboxAudioRunning,
} from "./use-inbox-sound";

/** Fonte de áudio que a eleição observa (contexto do inbox por padrão). */
export interface SoundOwnerAudioSource {
  /** `true` só com o AudioContext `running`. */
  isRunning: () => boolean;
  /** Evento de `window` disparado quando o contexto destrava. */
  unlockedEvent: string;
}

const INBOX_AUDIO: SoundOwnerAudioSource = {
  isRunning: isInboxAudioRunning,
  unlockedEvent: INBOX_AUDIO_UNLOCKED_EVENT,
};

/**
 * Uma aba só toca o aviso: a dona do Web Lock `lockName`
 * (`inbox-sound:<org>:<user>`, `nav-sound:<org>:<user>`). Sem isto cada
 * aba aberta do CRM tocava o mesmo aviso — o debounce do ping é por aba.
 *
 * A eleição em si é `createSoundOwnerElection` (pura); aqui ficam só os
 * listeners de foco e de destravamento do áudio. Passe `audio` (constante
 * de módulo) para um AudioContext que não seja o do inbox.
 *
 * Devolve `isOwner()` para ler no handler do SSE (ref, sem re-render).
 */
export function useInboxSoundOwner(
  lockName: string | null,
  audio: SoundOwnerAudioSource = INBOX_AUDIO,
): {
  isOwner: () => boolean;
  /** `true` se outra aba segura o lock agora. */
  heldElsewhere: () => Promise<boolean>;
} {
  const electionRef = useRef<SoundOwnerElection | null>(null);

  useEffect(() => {
    if (!lockName) return;
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    const election = createSoundOwnerElection({
      lockName,
      locks,
      isAudioRunning: audio.isRunning,
    });
    electionRef.current = election;

    const onFocus = () => election.acquire(true);
    const onUnlocked = () => election.acquire(document.hasFocus());

    election.acquire(document.hasFocus());
    window.addEventListener("focus", onFocus);
    window.addEventListener(audio.unlockedEvent, onUnlocked);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(audio.unlockedEvent, onUnlocked);
      election.dispose();
      if (electionRef.current === election) electionRef.current = null;
    };
  }, [lockName, audio]);

  const isOwner = useCallback(() => electionRef.current?.isOwner() ?? false, []);

  const heldElsewhere = useCallback(async () => {
    if (!lockName || electionRef.current?.isOwner()) return false;
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
