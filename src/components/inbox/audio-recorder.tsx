"use client";

import * as React from "react";
import { IconCheck as Check, IconMicrophone as Mic, IconTrash as Trash2, IconSend as Send } from "@tabler/icons-react";
import { toast } from "sonner";
import { TooltipHost } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  pickVoiceRecorderMime,
  VOICE_RECORDER_AUDIO_CONSTRAINTS,
} from "@/lib/voice-recorder-format";

type AudioRecorderProps = { onSend: (blob: Blob) => void; disabled?: boolean; className?: string };

export function AudioRecorder({ onSend, disabled, className }: AudioRecorderProps) {
  const [state, setState] = React.useState<"idle" | "recording" | "preview">("idle");
  const [duration, setDuration] = React.useState(0);
  const [audioBlob, setAudioBlob] = React.useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = React.useState<string | null>(null);
  const mediaRecorder = React.useRef<MediaRecorder | null>(null);
  const chunks = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

  const cleanup = React.useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    mediaRecorder.current = null;
    chunks.current = [];
  }, [audioUrl]);

  React.useEffect(() => () => cleanup(), [cleanup]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: VOICE_RECORDER_AUDIO_CONSTRAINTS,
      });
      streamRef.current = stream;
      const mimeType = pickVoiceRecorderMime();
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorder.current = recorder;
      chunks.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: mimeType });
        setAudioBlob(blob); setAudioUrl(URL.createObjectURL(blob)); setState("preview");
        streamRef.current?.getTracks().forEach((t) => t.stop());
      };
      recorder.start(250); setDuration(0); setState("recording");
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    } catch { toast.error("Não foi possível acessar o microfone."); }
  };

  const stopRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") mediaRecorder.current.stop();
  };
  const discard = () => { cleanup(); setAudioBlob(null); setAudioUrl(null); setDuration(0); setState("idle"); };
  const send = () => { if (audioBlob) { onSend(audioBlob); discard(); } };
  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  if (state === "idle") {
    return (
      <TooltipHost
        label="Gravar mensagem de voz"
        side="top"
        align="center"
        contentClassName="text-center"
      >
        <button
          type="button"
          onClick={startRecording}
          disabled={disabled}
          className={cn(
            "flex size-[52px] items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-sm lumen-transition hover:scale-105 hover:brightness-110 disabled:opacity-50",
            className,
          )}
          aria-label="Gravar áudio"
        >
          <Mic className="size-5" />
        </button>
      </TooltipHost>
    );
  }

  if (state === "recording") {
    return (
      <div className={cn("flex min-w-0 shrink-0 flex-row items-center gap-2", className)}>
        <TooltipHost label="Cancelar gravação" side="top" contentClassName="text-center">
          <button
            type="button"
            onClick={discard}
            aria-label="Cancelar gravação"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-ink-subtle)] lumen-transition hover:scale-105 hover:bg-muted hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
        </TooltipHost>
        <div className="flex min-w-0 items-center gap-1.5 rounded-full bg-[var(--color-danger)]/10 px-2.5 py-1">
          <span className="size-2 shrink-0 rounded-full bg-[var(--color-danger)]" style={{ animation: "pulse-dot 2s infinite" }} />
          <span className="text-[12px] font-medium text-[var(--color-danger)]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {formatTime(duration)}
          </span>
        </div>
        <TooltipHost label="Parar e revisar" side="top" contentClassName="text-center">
          <button
            type="button"
            onClick={stopRecording}
            aria-label="Parar gravação"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-danger)] text-white lumen-transition hover:scale-105"
            style={{ animation: "pulse-record 1s infinite" }}
          >
            <Check className="size-4" strokeWidth={2.5} />
          </button>
        </TooltipHost>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {audioUrl && <audio src={audioUrl} controls className="h-7 max-w-[160px]" />}
      <TooltipHost label="Descartar áudio" side="top" contentClassName="text-center">
        <button type="button" onClick={discard} aria-label="Descartar áudio"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-danger)] lumen-transition hover:bg-[var(--color-danger)]/10 hover:scale-105">
          <Trash2 className="size-4" />
        </button>
      </TooltipHost>
      <TooltipHost label="Enviar áudio" side="top" contentClassName="text-center">
        <button
          type="button"
          onClick={send}
          disabled={disabled}
          aria-label="Enviar áudio"
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-sm lumen-transition hover:scale-105 hover:brightness-110 disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </TooltipHost>
    </div>
  );
}
