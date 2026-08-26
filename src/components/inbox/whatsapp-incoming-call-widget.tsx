"use client";

/**
 * Overlay global de chamada WhatsApp de entrada.
 * Montado no layout autenticado — o agente atende mesmo fora do ticket.
 */

import * as React from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  IconMicrophone,
  IconMicrophoneOff,
  IconPhoneIncoming,
  IconPhoneOff,
  IconLoader2,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useWhatsappInboundWebRtc } from "@/hooks/use-whatsapp-inbound-webrtc";

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const sec = (totalSec % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

function startRingtone(): () => void {
  if (typeof window === "undefined") return () => {};
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return () => {};
  let ctx: AudioContext | null = null;
  let timer: number | null = null;
  try {
    ctx = new AC();
    const beep = () => {
      if (!ctx || ctx.state === "closed") return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    };
    void ctx.resume();
    beep();
    timer = window.setInterval(beep, 1400);
  } catch {
    return () => {};
  }
  return () => {
    if (timer) window.clearInterval(timer);
    try {
      void ctx?.close();
    } catch {
      /* ignore */
    }
  };
}

export function WhatsappIncomingCallWidget() {
  const { status: sessionStatus } = useSession();
  const enabled = sessionStatus === "authenticated";
  const inbound = useWhatsappInboundWebRtc(enabled);
  const router = useRouter();
  const remoteAudioRef = React.useRef<HTMLAudioElement | null>(null);
  const [answering, setAnswering] = React.useState(false);

  React.useEffect(() => {
    if (inbound.phase !== "ringing") return;
    return startRingtone();
  }, [inbound.phase]);

  React.useEffect(() => {
    const el = remoteAudioRef.current;
    if (!el) return;
    el.srcObject = inbound.remoteStream;
    el.muted = false;
    el.volume = 1;
    if (inbound.remoteStream) {
      void el.play().catch(() => {});
    }
  }, [inbound.remoteStream]);

  React.useEffect(() => {
    if (inbound.phase === "error" && inbound.errorMsg) {
      toast.error(inbound.errorMsg);
    }
  }, [inbound.phase, inbound.errorMsg]);

  if (!enabled) return null;
  if (inbound.phase === "idle") return null;

  const name =
    inbound.incoming?.contactName?.trim() ||
    inbound.incoming?.fromWa ||
    "Cliente WhatsApp";
  const isRinging = inbound.phase === "ringing";
  const isLive = inbound.phase === "live";
  const isConnecting = inbound.phase === "connecting";

  const onAnswer = async () => {
    setAnswering(true);
    const convId = inbound.incoming?.conversationId;
    if (convId) {
      router.push(`/inbox?c=${encodeURIComponent(convId)}`);
    }
    const r = await inbound.answer();
    setAnswering(false);
    if (!r.ok && r.error) toast.error(r.error);
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-[80] flex flex-col items-end gap-2"
      role="region"
      aria-label="Chamada WhatsApp recebida"
    >
      <audio ref={remoteAudioRef} autoPlay playsInline />
      <div
        className={cn(
          "w-[280px] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl",
          "border-[var(--glass-border)] bg-[var(--glass-bg-base)] text-[var(--text-primary)]",
          "dark:border-[var(--glass-border-subtle)] dark:bg-[var(--glass-bg-panel)]",
        )}
        role="dialog"
        aria-label="Chamada WhatsApp"
      >
        <div className="mb-3 flex items-center gap-2">
          {isRinging ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-success)] opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
            </span>
          ) : (
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-[var(--color-success)]" />
          )}
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            {isRinging
              ? "WhatsApp · chamada recebida"
              : isConnecting
                ? "WhatsApp · conectando…"
                : inbound.phase === "error"
                  ? "WhatsApp · falha"
                  : "WhatsApp · em chamada"}
          </span>
        </div>

        <div className="mb-4 flex items-baseline justify-between gap-2">
          <span className="truncate text-lg font-semibold">{name}</span>
          {isLive && (
            <span className="font-mono text-sm text-[var(--text-muted)]">
              {formatDuration(inbound.durationMs)}
            </span>
          )}
        </div>

        {inbound.phase === "error" && inbound.errorMsg ? (
          <p className="mb-3 text-xs text-[var(--color-danger)]">{inbound.errorMsg}</p>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {isRinging ? (
            <>
              <button
                type="button"
                onClick={() => void onAnswer()}
                disabled={answering}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-success)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--color-success)] active:scale-[0.98] disabled:opacity-60"
              >
                {answering ? <IconLoader2 size={16} className="animate-spin" /> : <IconPhoneIncoming size={16} />}
                Atender
              </button>
              <button
                type="button"
                onClick={() => void inbound.reject()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition active:scale-[0.98]"
              >
                <IconPhoneOff size={16} />
                Recusar
              </button>
            </>
          ) : isConnecting ? (
            <button
              type="button"
              disabled
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-success)]/80 px-4 py-2 text-sm font-semibold text-white"
            >
              <IconLoader2 size={16} className="animate-spin" />
              Atendendo…
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={inbound.toggleMute}
                aria-pressed={inbound.muted}
                className={cn(
                  "inline-flex size-10 items-center justify-center rounded-full border text-sm",
                  inbound.muted
                    ? "border-[var(--color-danger)] text-[var(--color-danger)]"
                    : "border-[var(--glass-border)]",
                )}
                title={inbound.muted ? "Ativar microfone" : "Mudo"}
              >
                {inbound.muted ? <IconMicrophoneOff size={16} /> : <IconMicrophone size={16} />}
              </button>
              <button
                type="button"
                onClick={() => void inbound.hangup()}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[var(--color-danger)] px-4 py-2 text-sm font-semibold text-white"
              >
                <IconPhoneOff size={16} />
                Encerrar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
