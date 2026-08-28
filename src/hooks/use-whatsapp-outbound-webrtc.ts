"use client";

import { apiUrl } from "@/lib/api";
import { postWhatsappCall } from "@/lib/wa-whatsapp-call";
import * as React from "react";

import {
  startCallRecording,
  uploadCallRecording,
  type CallRecordingHandle,
} from "@/lib/call-recording";
import { getBrowserIceServers } from "@/lib/webrtc-ice";
import { sanitizeMetaWhatsappSdpForBrowser, stripSsrcLinesFromSdp } from "@/lib/whatsapp-webrtc-sdp";
import { useSSE } from "@/hooks/use-sse";
import { ensureMicrophonePermission } from "@/lib/native/permissions";

function waitIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 12_000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(), timeoutMs);
    pc.addEventListener(
      "icegatheringstatechange",
      () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(timer);
          resolve();
        }
      },
      { once: false },
    );
  });
}

export type OutboundCallPhase = "idle" | "need_answer" | "live" | "error";

/**
 * Ligação de saída WhatsApp (Cloud API): cria SDP offer no browser, POST initiate,
 * aplica SDP answer recebido no webhook `calls` (via SSE).
 */
export function useWhatsappOutboundWebRtc(conversationId: string | null | undefined) {
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const expectedCallIdRef = React.useRef<string | null>(null);
  const appliedAnswerRef = React.useRef(false);
  const queuedAnswerRef = React.useRef<{ callId: string; sdp: string } | null>(null);
  const recorderRef = React.useRef<CallRecordingHandle | null>(null);
  const recordingStartedForCallRef = React.useRef<string | null>(null);
  const acceptedRef = React.useRef(false);
  const conversationIdRef = React.useRef<string | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  conversationIdRef.current = conversationId ?? null;

  const [phase, setPhase] = React.useState<OutboundCallPhase>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [activeCallId, setActiveCallId] = React.useState<string | null>(null);
  /** Áudio recebido do WhatsApp — usar num elemento audio com autoPlay e playsInline. */
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  remoteStreamRef.current = remoteStream;
  const [isInitiating, setIsInitiating] = React.useState(false);
  const [mediaDebug, setMediaDebug] = React.useState<{ ice: string; conn: string } | null>(null);

  /**
   * Inicia o MediaRecorder no momento do ACCEPTED (não espera o useEffect).
   * Se o terminate chegar no mesmo tick, o effect de `phase==="live"`
   * nunca roda e a gravação se perdia.
   */
  const beginRecording = React.useCallback(() => {
    if (recorderRef.current) return;
    const local = streamRef.current;
    const remote = remoteStreamRef.current;
    if (!local || !remote) return;
    const callId = expectedCallIdRef.current;
    if (!callId) return;
    if (recordingStartedForCallRef.current === callId) return;

    const handle = startCallRecording(local, remote);
    if (!handle) {
      console.warn(
        "[outbound-webrtc] gravação NÃO iniciou — MediaRecorder indisponível ou streams sem áudio.",
      );
      return;
    }
    recorderRef.current = handle;
    recordingStartedForCallRef.current = callId;
    console.info(
      `[outbound-webrtc] gravação iniciada callId=${callId} mime=${handle.mime}`,
    );
  }, []);

  /**
   * Encerra a gravação em andamento (se houver) e dispara o upload
   * assincronamente. Não bloqueia o cleanup da chamada.
   */
  const finishRecording = React.useCallback(() => {
    const handle = recorderRef.current;
    const callId = recordingStartedForCallRef.current;
    const convId = conversationIdRef.current;
    recorderRef.current = null;
    recordingStartedForCallRef.current = null;
    if (!handle || !convId) {
      handle?.abort?.();
      return;
    }
    const startedAt = handle.startedAt;
    void handle
      .stop()
      .then((blob) => {
        if (!blob || blob.size === 0) {
          console.warn(
            `[outbound-webrtc] gravação finalizou vazia callId=${callId} — nada para upload.`,
          );
          return;
        }
        console.info(
          `[outbound-webrtc] upload de gravação callId=${callId} bytes=${blob.size}`,
        );
        void uploadCallRecording({
          conversationId: convId,
          callId,
          blob,
          ext: handle.ext,
          startedAt,
          endedAt: new Date(),
          direction: "BUSINESS_INITIATED",
        });
      })
      .catch((err) => {
        console.warn("[outbound-webrtc] finalizar gravação falhou:", err);
      });
  }, []);

  const releasePc = React.useCallback(() => {
    finishRecording();
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    streamRef.current = null;
    try {
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
    expectedCallIdRef.current = null;
    appliedAnswerRef.current = false;
    queuedAnswerRef.current = null;
    acceptedRef.current = false;
    remoteStreamRef.current = null;
    setActiveCallId(null);
    setRemoteStream(null);
    setMediaDebug(null);
  }, [finishRecording]);

  const reset = React.useCallback(() => {
    releasePc();
    setPhase("idle");
    setErrorMsg(null);
  }, [releasePc]);

  const terminateSilently = React.useCallback(
    (callId: string) => {
      if (!conversationId || !callId) return;
      void postWhatsappCall(conversationId, { action: "terminate", call_id: callId }).catch(
        () => {},
      );
    },
    [conversationId],
  );

  const applyAnswer = React.useCallback(
    async (callId: string, sdp: string) => {
      const pc = pcRef.current;
      const expected = expectedCallIdRef.current;
      if (!pc) {
        queuedAnswerRef.current = { callId, sdp };
        return;
      }
      if (!expected) {
        queuedAnswerRef.current = { callId, sdp };
        return;
      }
      if (callId !== expected) return;
      if (appliedAnswerRef.current) return;
      appliedAnswerRef.current = true;
      try {
        const candidates = [
          sanitizeMetaWhatsappSdpForBrowser(sdp),
          stripSsrcLinesFromSdp(sanitizeMetaWhatsappSdpForBrowser(sdp)),
        ];
        let lastErr: unknown;
        for (const sdpBody of candidates) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: sdpBody }));
            lastErr = undefined;
            break;
          } catch (err) {
            lastErr = err;
          }
        }
        if (lastErr) throw lastErr;
        queuedAnswerRef.current = null;
        // SDP/toque ≠ atendimento. Gravação e "Em chamada" só no ACCEPTED.
        setPhase(acceptedRef.current ? "live" : "need_answer");
        if (acceptedRef.current) beginRecording();
      } catch (e) {
        appliedAnswerRef.current = false;
        const m = e instanceof Error ? e.message : "SDP answer inválido";
        setErrorMsg(m);
        setPhase("error");
        terminateSilently(expected);
        releasePc();
      }
    },
    [releasePc, terminateSilently, beginRecording],
  );

  const initiate = React.useCallback(async (): Promise<{ ok: boolean; callId?: string; error?: string }> => {
    if (!conversationId) {
      const m = "Sem conversa.";
      setErrorMsg(m);
      setPhase("error");
      return { ok: false, error: m };
    }
    releasePc();
    setErrorMsg(null);
    setPhase("idle");
    setIsInitiating(true);

    try {
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error("WebRTC não suportado neste browser.");
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Microfone indisponível. Use HTTPS e conceda permissão ao microfone.");
      }
      const permission = await ensureMicrophonePermission();
      if (!permission.ok) {
        throw new Error(permission.error ?? "Microfone indisponível. Use HTTPS e conceda permissão ao microfone.");
      }

      const pc = new RTCPeerConnection({
        iceServers: getBrowserIceServers(),
      });
      pcRef.current = pc;

      const bumpDebug = () => {
        setMediaDebug({ ice: pc.iceConnectionState, conn: pc.connectionState });
      };
      pc.oniceconnectionstatechange = bumpDebug;
      pc.onconnectionstatechange = () => {
        bumpDebug();
        const s = pc.connectionState;
        if (s === "failed") {
          const cid = expectedCallIdRef.current;
          setErrorMsg((prev) => prev ?? "Falha na ligação de mídia (ICE/rede).");
          setPhase("error");
          if (cid) terminateSilently(cid);
          releasePc();
          return;
        }
        // "disconnected" é transitório (ICE restart / answer ainda a chegar).
        // Encerrar aí mata o PeerConnection antes do SDP answer da Meta —
        // a chamada fica "ligada" no telemóvel mas muda dos dois lados.
        if (s === "closed") {
          releasePc();
          setPhase("idle");
        }
      };

      pc.ontrack = (ev) => {
        const [first] = ev.streams;
        const stream =
          first?.getTracks().length ? first : ev.track ? new MediaStream([ev.track]) : null;
        if (!stream) return;
        for (const t of stream.getAudioTracks()) t.enabled = true;
        remoteStreamRef.current = stream;
        setRemoteStream(stream);
        if (acceptedRef.current) beginRecording();
      };

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      streamRef.current = stream;
      for (const track of stream.getTracks()) {
        track.enabled = true;
        pc.addTrack(track, stream);
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      await waitIceGatheringComplete(pc);

      const sdp = pc.localDescription?.sdp;
      if (!sdp?.trim()) throw new Error("SDP offer vazio após recolha ICE.");

      const data = await postWhatsappCall<{ calls?: { id: string }[] }>(conversationId, {
        action: "initiate",
        session: { sdp_type: "offer", sdp },
      });
      const callId = data.calls?.[0]?.id;
      if (!callId) throw new Error("Meta não devolveu o ID da chamada.");

      expectedCallIdRef.current = callId;
      appliedAnswerRef.current = false;
      setActiveCallId(callId);
      setPhase("need_answer");
      bumpDebug();

      const queued = queuedAnswerRef.current;
      if (queued && queued.callId === callId) {
        queuedAnswerRef.current = null;
        void applyAnswer(queued.callId, queued.sdp);
      }

      return { ok: true, callId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      releasePc();
      setErrorMsg(msg);
      setPhase("error");
      return { ok: false, error: msg };
    } finally {
      setIsInitiating(false);
    }
  }, [conversationId, releasePc, terminateSilently, applyAnswer, beginRecording]);

  // Fallback: o webhook `connect` com SDP answer pode chegar ANTES do
  // browser ter o callId (SSE dropado). Poll persiste o SDP no evento.
  React.useEffect(() => {
    if (phase !== "need_answer" || !conversationId) return;
    const callId = expectedCallIdRef.current;
    if (!callId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(
          apiUrl(
            `/api/conversations/${conversationId}/whatsapp-calls?answerFor=${encodeURIComponent(callId)}`,
          ),
        );
        const data = (await res.json().catch(() => ({}))) as {
          pendingAnswer?: { sdp_type?: string; sdp?: string } | null;
          items?: { metaCallId?: string; signalingStatus?: string | null }[];
        };
        if (stopped) return;
        const sess = data.pendingAnswer;
        if (sess?.sdp && sess.sdp_type?.toLowerCase() === "answer") {
          void applyAnswer(callId, sess.sdp);
        }
        const accepted = (data.items ?? []).some(
          (it) =>
            it.metaCallId === callId && (it.signalingStatus ?? "").toUpperCase() === "ACCEPTED",
        );
        if (accepted) {
          acceptedRef.current = true;
          if (appliedAnswerRef.current) {
            setPhase("live");
            beginRecording();
          }
        }
      } catch {
        /* ignore */
      }
    };
    const timer = window.setInterval(() => void tick(), 900);
    void tick();
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [phase, conversationId, applyAnswer, beginRecording]);

  // Backup: se ACCEPTED chegou antes do remoteStream, beginRecording
  // no handler falha; o effect tenta de novo quando o stream chega.
  React.useEffect(() => {
    if (phase !== "live") return;
    beginRecording();
  }, [phase, remoteStream, beginRecording]);

  // Encerramento remoto via webhook da Meta. Sem este listener, quando o
  // cliente desligava a chamada, o PeerConnection podia ficar em estado
  // intermediário e o MediaRecorder nunca parava → blob perdido.
  useSSE(
    "/api/sse/messages",
    React.useCallback(
      (event: string, data: unknown) => {
        if (event !== "whatsapp_call") return;
        const p = data as {
          conversationId?: string;
          callId?: string;
          event?: string;
          signalingStatus?: string;
          session?: { sdp_type?: string; sdp?: string };
        };
        const sdp = p.session?.sdp;
        const sdpType = p.session?.sdp_type?.toLowerCase();
        if (p.callId && sdp && sdpType === "answer") {
          void applyAnswer(p.callId, sdp);
        }
        const sig = (p.signalingStatus ?? "").toUpperCase();
        if (sig === "ACCEPTED") {
          const mine = expectedCallIdRef.current ?? activeCallId;
          if (!p.callId || !mine || p.callId === mine) {
            acceptedRef.current = true;
            if (appliedAnswerRef.current) {
              setPhase("live");
              beginRecording();
            }
          }
        }
        if ((p.event ?? "").toLowerCase() !== "terminate") return;
        const mine = expectedCallIdRef.current ?? activeCallId;
        if (!mine || p.callId !== mine) return;
        releasePc();
        setPhase("idle");
      },
      [activeCallId, releasePc, applyAnswer, beginRecording],
    ),
    !!conversationId,
  );

  const terminate = React.useCallback(
    async (callIdOverride?: string | null) => {
      const cid = callIdOverride ?? activeCallId ?? expectedCallIdRef.current;
      if (!conversationId || !cid) {
        reset();
        return;
      }
      try {
        await postWhatsappCall(conversationId, { action: "terminate", call_id: cid });
      } catch {
        /* ignore */
      } finally {
        reset();
      }
    },
    [conversationId, activeCallId, reset],
  );

  return {
    phase,
    errorMsg,
    activeCallId,
    remoteStream,
    isInitiating,
    mediaDebug,
    initiate,
    applyAnswer,
    terminate,
    reset,
  };
}
