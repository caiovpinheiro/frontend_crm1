"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  IconMicrophone,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconSend,
  IconTrash,
} from "@tabler/icons-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { ButtonGlass } from "@/components/crm/button-glass";
import { useSendAttachment } from "@/features/inbox-v2/hooks";
import { ensureMicrophonePermission } from "@/lib/native/permissions";
import {
  pickVoiceRecorderMime,
  voiceRecorderFileExt,
  VOICE_RECORDER_AUDIO_CONSTRAINTS,
} from "@/lib/voice-recorder-format";

// ─────────────────────────────────────────────────────────────────
// Types (exported so Composer can track state)
// ─────────────────────────────────────────────────────────────────

export type AudioRecordState = "idle" | "recording" | "preview";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

// Static bar heights for a WhatsApp-like waveform pattern
const BAR_PATTERN = [3, 5, 9, 14, 18, 14, 9, 12, 16, 10, 6, 8, 14, 18, 12, 7, 10, 16, 11, 5];

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────

/**
 * Gravação de áudio estilo WhatsApp para o Composer.
 *
 * Estados:
 *  - idle      → apenas o botão de microfone
 *  - recording → barra de gravação inline (flex-1) com timer + ondas animadas
 *  - preview   → player de áudio inline para ouvir antes de confirmar o envio
 *
 * onStateChange notifica o Composer para ele esconder/mostrar o textarea
 * e os outros controles conforme o estado de gravação.
 */
export function AudioRecorderButton({
  conversationId,
  className,
  onStateChange,
  disabled,
  beforeSend,
  onBlocked,
}: {
  conversationId: string | null;
  className?: string;
  /** Notifica o Composer quando o estado de gravação muda */
  onStateChange?: (s: AudioRecordState) => void;
  disabled?: boolean;
  /** Se retornar false, o envio do áudio é abortado (ex.: confirmação de canal). */
  beforeSend?: () => boolean | Promise<boolean>;
  /** Chamado quando a gravação é bloqueada (sessão encerrada, etc.). */
  onBlocked?: () => void;
}) {
  const sendAttachment = useSendAttachment(conversationId);

  // ── Refs ─────────────────────────────────────────────────────────
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const streamRef     = useRef<MediaStream | null>(null);
  const audioBlobRef  = useRef<Blob | null>(null);
  const audioUrlRef   = useRef<string | null>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const discardingRef = useRef(false);
  const finalizedRef  = useRef(false);
  const mimeRef       = useRef<string>("audio/webm");
  const audioElRef    = useRef<HTMLAudioElement | null>(null);

  // ── State ─────────────────────────────────────────────────────────
  const [recState,  setRecStateRaw] = useState<AudioRecordState>("idle");
  const [seconds,   setSeconds]     = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [playing,   setPlaying]     = useState(false);

  // Wrapper que propaga o estado para o pai
  const setRecState = useCallback(
    (s: AudioRecordState) => { setRecStateRaw(s); onStateChange?.(s); },
    [onStateChange],
  );

  // ── Cleanup on unmount ────────────────────────────────────────────
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  // ── Timer ─────────────────────────────────────────────────────────
  const startTimer = useCallback(() => {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ── Finaliza gravação → preview (idempotente) ─────────────────────
  // Não depende do evento `onstop` do MediaRecorder, que em alguns
  // webviews (Capacitor/WebView Android) não dispara de forma confiável —
  // era a causa do "stop não para" (timer/ondas continuavam). Chamado tanto
  // pelo `onstop` quanto diretamente pelo botão de parar.
  const finalizeToPreview = useCallback(() => {
    if (finalizedRef.current) return;
    if (discardingRef.current) return; // discard() cuida da própria limpeza
    finalizedRef.current = true;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopTimer();

    const blob = new Blob(chunksRef.current, { type: mimeRef.current });
    if (blob.size === 0) { setRecState("idle"); setSeconds(0); return; }

    audioBlobRef.current = blob;
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const url = URL.createObjectURL(blob);
    audioUrlRef.current = url;
    setPreviewUrl(url);
    setRecState("preview");
  }, [stopTimer, setRecState]);

  // ── Start recording ───────────────────────────────────────────────
  async function start() {
    if (disabled) {
      onBlocked?.();
      return;
    }
    if (!conversationId) { toast.error("Selecione uma conversa antes de gravar"); return; }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Gravação não suportada neste navegador"); return;
    }
    const permission = await ensureMicrophonePermission();
    if (!permission.ok) {
      toast.error(permission.error ?? "Não foi possível acessar o microfone");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: VOICE_RECORDER_AUDIO_CONSTRAINTS,
      });
      streamRef.current = stream;
      chunksRef.current = [];
      discardingRef.current = false;
      finalizedRef.current = false;

      const mime = pickVoiceRecorderMime();
      mimeRef.current = mime;
      const rec = new MediaRecorder(stream, { mimeType: mime });

      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        if (discardingRef.current) {
          // discard() já parou stream/timer; aqui só limpamos os buffers.
          discardingRef.current = false;
          finalizedRef.current = true;
          stream.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
          stopTimer();
          chunksRef.current = [];
          audioBlobRef.current = null;
          setRecState("idle");
          setSeconds(0);
          return;
        }
        finalizeToPreview();
      };

      recorderRef.current = rec;
      rec.start(100);
      setRecState("recording");
      startTimer();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível acessar o microfone");
    }
  }

  // ── Stop → preview ────────────────────────────────────────────────
  function stopRecording() {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    // Flush do último buffer e stop; o `onstop` chama finalizeToPreview.
    try { rec.requestData?.(); } catch { /* noop */ }
    try { rec.stop(); } catch { /* already stopped */ }
    // Fallback: se `onstop` não disparar (webviews), finalizamos direto.
    // finalizeToPreview é idempotente (finalizedRef), então não duplica.
    window.setTimeout(() => finalizeToPreview(), 250);
  }

  // ── Discard ───────────────────────────────────────────────────────
  function discard() {
    discardingRef.current = true;
    finalizedRef.current = true;
    if (audioElRef.current) { audioElRef.current.pause(); audioElRef.current.currentTime = 0; }
    setPlaying(false);
    if (recorderRef.current) {
      try { recorderRef.current.stop(); } catch { /* */ }
      recorderRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    stopTimer();
    if (audioUrlRef.current) { URL.revokeObjectURL(audioUrlRef.current); audioUrlRef.current = null; }
    audioBlobRef.current = null;
    chunksRef.current = [];
    setPreviewUrl(null);
    setRecState("idle");
    setSeconds(0);
  }

  // ── Send ──────────────────────────────────────────────────────────
  async function sendAudio() {
    const blob = audioBlobRef.current;
    if (!blob || blob.size === 0) { toast.error("Nenhum áudio para enviar"); return; }
    if (disabled) {
      onBlocked?.();
      return;
    }
    if (beforeSend) {
      const ok = await beforeSend();
      if (!ok) return;
    }
    const ext = voiceRecorderFileExt(blob.type || mimeRef.current);
    sendAttachment.mutate(
      { file: blob, fileName: `audio-${Date.now()}.${ext}` },
      {
        onSuccess: (data) => {
          if (data.audioDelivery && data.audioDelivery !== "voice") {
            toast("Enviado como áudio (não como nota de voz)");
          }
          discard();
        },
        onError: (err) => toast.error(err.message || "Falha ao enviar áudio"),
      },
    );
  }

  // ── Recording bar (inline, flex-1) ───────────────────────────────
  if (recState === "recording") {
    return (
      <div className="flex flex-1 items-center gap-3 min-w-0">
        {/* Discard */}
        <button
          type="button"
          onClick={discard}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
          aria-label="Descartar gravação"
        >
          <IconTrash size={16} />
        </button>

        {/* Red dot + timer */}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-[var(--color-danger)]" />
          <span className="font-mono text-[13px] font-semibold tabular-nums text-[var(--text-primary)]">
            {formatTime(seconds)}
          </span>
        </div>

        {/* Animated waveform */}
        <div className="flex flex-1 items-center justify-center gap-1 overflow-hidden" aria-hidden>
          {BAR_PATTERN.map((h, i) => (
            <span
              key={i}
              className="audio-wave-bar w-[3px] shrink-0 rounded-full bg-[var(--brand-primary)]"
              style={{
                height: `${h}px`,
                animationDelay: `${(i % 7) * 0.08}s`,
                animationDuration: `${0.5 + (i % 5) * 0.1}s`,
              }}
            />
          ))}
        </div>

        {/* Stop → preview */}
        <button
          type="button"
          onClick={stopRecording}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white shadow-[0_2px_12px_rgba(91,111,245,0.40)] transition-transform hover:scale-105 active:scale-95"
          aria-label="Parar gravação"
        >
          <IconPlayerStop size={16} fill="currentColor" />
        </button>
      </div>
    );
  }

  // ── Preview bar (inline, flex-1) ──────────────────────────────────
  if (recState === "preview") {
    return (
      <div className="flex flex-1 items-center gap-3 min-w-0">
        {/* Hidden audio element */}
        {previewUrl && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <audio
            ref={audioElRef}
            src={previewUrl}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => { setPlaying(false); if (audioElRef.current) audioElRef.current.currentTime = 0; }}
          />
        )}

        {/* Discard */}
        <button
          type="button"
          onClick={discard}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/10"
          aria-label="Descartar áudio"
        >
          <IconTrash size={16} />
        </button>

        {/* Play / Pause */}
        <button
          type="button"
          onClick={() => {
            const a = audioElRef.current;
            if (!a) return;
            if (playing) { a.pause(); } else { void a.play(); }
          }}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--brand-primary)]/25 bg-[var(--brand-primary)]/8 text-[var(--brand-primary)] transition-colors hover:bg-[var(--brand-primary)]/15"
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <IconPlayerPause size={15} /> : <IconPlayerPlay size={15} />}
        </button>

        {/* Duration */}
        <span className="shrink-0 font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
          {formatTime(seconds)}
        </span>

        {/* Static waveform */}
        <div className="flex flex-1 items-center justify-center gap-1 overflow-hidden" aria-hidden>
          {BAR_PATTERN.map((h, i) => (
            <span
              key={i}
              className={cn(
                "w-[3px] shrink-0 rounded-full transition-colors",
                playing ? "bg-[var(--brand-primary)]/60" : "bg-[var(--brand-primary)]/25",
              )}
              style={{ height: `${h}px` }}
            />
          ))}
        </div>

        {/* Confirm send */}
        <button
          type="button"
          onClick={sendAudio}
          disabled={sendAttachment.isPending}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary)] text-white shadow-[0_2px_12px_rgba(91,111,245,0.40)] transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
          aria-label="Enviar áudio"
        >
          {sendAttachment.isPending ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--glass-border)] border-t-white" />
          ) : (
            <IconSend size={16} />
          )}
        </button>
      </div>
    );
  }

  // ── Idle: apenas o botão de microfone ─────────────────────────────
  return (
    <ButtonGlass
      type="button"
      variant="icon"
      size="icon"
      className={className}
      onClick={start}
      disabled={sendAttachment.isPending || !conversationId || !!disabled}
      title={disabled ? "Sessão encerrada — use um template" : "Gravar áudio"}
    >
      <IconMicrophone size={20} />
    </ButtonGlass>
  );
}
