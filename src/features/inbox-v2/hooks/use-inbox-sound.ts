"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Aviso sonoro do inbox: toca um "ping" curto a cada mensagem RECEBIDA
 * (direction="in"). O operador pode silenciar; a preferência fica no
 * localStorage e sincroniza entre abas.
 *
 * O som é sintetizado via Web Audio API (sem asset externo). Navegadores
 * exigem um gesto do usuário para iniciar áudio — o AudioContext é
 * destravado no clique do botão de mudo e em qualquer pointerdown/keydown
 * (listener em `NavMessageAlertsProvider`). Fora de gesto o `resume()`
 * falha em silêncio, então o ping não tenta: com o contexto travado ele
 * dispara `INBOX_AUDIO_LOCKED_EVENT` e não toca.
 */

const STORAGE_KEY = "inbox:sound-muted";
const CHANGE_EVENT = "inbox:sound-muted-changed";
/** Um ping foi descartado porque o AudioContext não está `running`. */
export const INBOX_AUDIO_LOCKED_EVENT = "inbox:audio-locked";
/** O AudioContext passou a `running` depois de um gesto. */
export const INBOX_AUDIO_UNLOCKED_EVENT = "inbox:audio-unlocked";

export function isInboxSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

export function setInboxSoundMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { muted } }));
  // Um gesto costuma acompanhar a (des)ativação — aproveita pra destravar o áudio.
  if (!muted) void resumeAudio();
}

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctor) return null;
  audioCtx ??= new Ctor();
  return audioCtx;
}

/**
 * `true` só com o contexto `running`. `suspended` (sem gesto) e o
 * `interrupted` do Safari contam como travado.
 */
export function isInboxAudioRunning(): boolean {
  return audioCtx?.state === "running";
}

/** Destrava o AudioContext num gesto do usuário (clique/tecla). */
export async function resumeAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx || ctx.state === "running" || ctx.state === "closed") return;
  try {
    await ctx.resume();
  } catch {
    /* ignore */
  }
  if ((ctx.state as string) === "running") {
    window.dispatchEvent(new CustomEvent(INBOX_AUDIO_UNLOCKED_EVENT));
  }
}

/** Evita bip duplicado quando vários `useInboxRealtime` estão montados. */
let lastPingAt = 0;
const PING_DEBOUNCE_MS = 400;

/** Toca o aviso sonoro, respeitando o mudo. Idempotente e não-bloqueante. */
export function playInboxPing(): void {
  if (isInboxSoundMuted()) return;
  const nowMs = Date.now();
  if (nowMs - lastPingAt < PING_DEBOUNCE_MS) return;
  lastPingAt = nowMs;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state !== "running") {
    window.dispatchEvent(new CustomEvent(INBOX_AUDIO_LOCKED_EVENT));
    return;
  }
  try {
    const now = ctx.currentTime;
    // Dois tons curtos ascendentes (nota de notificação agradável).
    const notes = [
      { freq: 880, at: 0 }, // A5
      { freq: 1174.66, at: 0.11 }, // D6
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      const t0 = now + n.at;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Hook de UI para o botão de mudo. Lê a preferência após o mount (evita
 * mismatch de SSR) e reage a mudanças de outras abas/instâncias.
 */
export function useInboxSoundMuted(): readonly [boolean, (muted: boolean) => void] {
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    setMuted(isInboxSoundMuted());
    const sync = () => setMuted(isInboxSoundMuted());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const set = useCallback((v: boolean) => setInboxSoundMuted(v), []);
  return [muted, set] as const;
}
