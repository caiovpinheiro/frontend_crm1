"use client";

import * as React from "react";
import { useSession } from "next-auth/react";

import { apiUrl } from "@/lib/api";
import { postWhatsappCall } from "@/lib/wa-whatsapp-call";
import {
  startCallRecording,
  uploadCallRecording,
  type CallRecordingHandle,
} from "@/lib/call-recording";
import { getBrowserIceServers, waitIceGatheringComplete } from "@/lib/webrtc-ice";
import { sanitizeMetaWhatsappSdpForBrowser, stripSsrcLinesFromSdp } from "@/lib/whatsapp-webrtc-sdp";
import { useSSE } from "@/hooks/use-sse";
import { ensureMicrophonePermission } from "@/lib/native/permissions";

export type InboundCallPhase = "idle" | "ringing" | "connecting" | "live" | "error";

export type IncomingWhatsappCall = {
  conversationId: string;
  callId: string;
  contactId?: string | null;
  contactName?: string | null;
  fromWa?: string | null;
  offerSdp?: string | null;
};

function applyOfferSdp(raw: string): string[] {
  const sanitized = sanitizeMetaWhatsappSdpForBrowser(raw);
  return [sanitized, stripSsrcLinesFromSdp(sanitized)];
}

/**
 * Chamada de entrada WhatsApp (Cloud API): webhook `connect` + SDP offer,
 * o agente atende no overlay (pre_accept → accept) e o áudio flui via WebRTC.
 */
export function useWhatsappInboundWebRtc(enabled: boolean) {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? null;
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const incomingRef = React.useRef<IncomingWhatsappCall | null>(null);
  const recorderRef = React.useRef<CallRecordingHandle | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const liveSinceRef = React.useRef<number | null>(null);

  const [phase, setPhase] = React.useState<InboundCallPhase>("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [incoming, setIncoming] = React.useState<IncomingWhatsappCall | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  const [muted, setMuted] = React.useState(false);
  const [durationMs, setDurationMs] = React.useState(0);
  incomingRef.current = incoming;
  const phaseRef = React.useRef(phase);
  phaseRef.current = phase;

  const finishRecording = React.useCallback(() => {
    const handle = recorderRef.current;
    const convId = incomingRef.current?.conversationId;
    const callId = incomingRef.current?.callId ?? null;
    recorderRef.current = null;
    if (!handle || !convId) {
      handle?.abort?.();
      return;
    }
    const startedAt = handle.startedAt;
    void handle
      .stop()
      .then((blob) => {
        if (!blob || blob.size === 0) return;
        void uploadCallRecording({
          conversationId: convId,
          callId,
          blob,
          ext: handle.ext,
          startedAt,
          endedAt: new Date(),
          direction: "USER_INITIATED",
        });
      })
      .catch(() => {});
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
    remoteStreamRef.current = null;
    liveSinceRef.current = null;
    setRemoteStream(null);
    setMuted(false);
    setDurationMs(0);
  }, [finishRecording]);

  const reset = React.useCallback(() => {
    releasePc();
    incomingRef.current = null;
    setIncoming(null);
    phaseRef.current = "idle";
    setPhase("idle");
    setErrorMsg(null);
  }, [releasePc]);

  const beginRecording = React.useCallback(() => {
    if (recorderRef.current) return;
    const local = streamRef.current;
    const remote = remoteStreamRef.current;
    if (!local || !remote) return;
    const handle = startCallRecording(local, remote);
    if (!handle) return;
    recorderRef.current = handle;
  }, []);

  React.useEffect(() => {
    if (phase !== "live") return;
    liveSinceRef.current = Date.now();
    const t = window.setInterval(() => {
      const start = liveSinceRef.current;
      if (start) setDurationMs(Date.now() - start);
    }, 500);
    return () => window.clearInterval(t);
  }, [phase]);

  React.useEffect(() => {
    if (phase !== "live") return;
    beginRecording();
  }, [phase, remoteStream, beginRecording]);

  const fetchOffer = React.useCallback(async (conversationId: string, callId: string) => {
    try {
      const res = await fetch(
        apiUrl(
          `/api/conversations/${conversationId}/whatsapp-calls?offerFor=${encodeURIComponent(callId)}`,
        ),
      );
      const data = (await res.json().catch(() => ({}))) as {
        pendingOffer?: { sdp?: string } | null;
      };
      return data.pendingOffer?.sdp?.trim() || null;
    } catch {
      return null;
    }
  }, []);

  const answer = React.useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    const cur = incomingRef.current;
    if (!cur?.conversationId || !cur.callId) {
      const m = "Sem chamada de entrada.";
      setErrorMsg(m);
      setPhase("error");
      return { ok: false, error: m };
    }
    setErrorMsg(null);
    setPhase("connecting");
    phaseRef.current = "connecting";

    try {
      if (typeof RTCPeerConnection === "undefined") {
        throw new Error("WebRTC não suportado neste browser.");
      }
      const permission = await ensureMicrophonePermission();
      if (!permission.ok) {
        throw new Error(permission.error ?? "Microfone indisponível.");
      }

      let offerSdp = cur.offerSdp?.trim() || "";
      if (!offerSdp) {
        offerSdp = (await fetchOffer(cur.conversationId, cur.callId)) || "";
      }
      if (!offerSdp) throw new Error("SDP de entrada não chegou. Peça ao cliente para ligar de novo.");

      const pc = new RTCPeerConnection({ iceServers: getBrowserIceServers() });
      pcRef.current = pc;
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "failed") {
          setErrorMsg((prev) => prev ?? "Falha na ligação de mídia (ICE/rede).");
          setPhase("error");
          void postWhatsappCall(cur.conversationId, {
            action: "terminate",
            call_id: cur.callId,
          }).catch(() => {});
          releasePc();
        }
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
        beginRecording();
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

      let lastErr: unknown;
      for (const sdpBody of applyOfferSdp(offerSdp)) {
        try {
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: sdpBody }),
          );
          lastErr = undefined;
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (lastErr) throw lastErr;

      const answerDesc = await pc.createAnswer();
      await pc.setLocalDescription(answerDesc);
      await waitIceGatheringComplete(pc);
      const sdp = pc.localDescription?.sdp;
      if (!sdp?.trim()) throw new Error("SDP answer vazio após recolha ICE.");

      const session = { sdp_type: "answer" as const, sdp };
      await postWhatsappCall(cur.conversationId, {
        action: "pre_accept",
        call_id: cur.callId,
        session,
      });
      await postWhatsappCall(cur.conversationId, {
        action: "accept",
        call_id: cur.callId,
        session,
      });

      setPhase("live");
      phaseRef.current = "live";
      beginRecording();
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      releasePc();
      setErrorMsg(msg);
      setPhase("error");
      return { ok: false, error: msg };
    }
  }, [beginRecording, fetchOffer, releasePc]);

  const reject = React.useCallback(async () => {
    const cur = incomingRef.current;
    if (cur?.conversationId && cur.callId) {
      try {
        await postWhatsappCall(cur.conversationId, {
          action: "reject",
          call_id: cur.callId,
        });
      } catch {
        /* ignore */
      }
    }
    reset();
  }, [reset]);

  const hangup = React.useCallback(async () => {
    const cur = incomingRef.current;
    if (cur?.conversationId && cur.callId) {
      try {
        await postWhatsappCall(cur.conversationId, {
          action: "terminate",
          call_id: cur.callId,
        });
      } catch {
        /* ignore */
      }
    }
    reset();
  }, [reset]);

  const toggleMute = React.useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      try {
        streamRef.current?.getAudioTracks().forEach((t) => {
          t.enabled = !next;
        });
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  useSSE(
    "/api/sse/messages",
    React.useCallback(
      (event: string, data: unknown) => {
        if (event !== "whatsapp_call") return;
        const p = data as {
          conversationId?: string;
          contactId?: string;
          contactName?: string | null;
          fromWa?: string | null;
          callId?: string;
          event?: string;
          direction?: string;
          signalingStatus?: string;
          assignedToId?: string | null;
          session?: { sdp_type?: string; sdp?: string };
        };
        const dir = (p.direction ?? "").toUpperCase();
        const kind = (p.event ?? "").toLowerCase();
        const sdpType = p.session?.sdp_type?.toLowerCase();
        const sdp = p.session?.sdp?.trim() || "";

        if (
          dir === "USER_INITIATED" &&
          kind === "connect" &&
          p.callId &&
          p.conversationId
        ) {
          const assigneeId = p.assignedToId?.trim() || null;
          if (!currentUserId || !assigneeId || assigneeId !== currentUserId) {
            return;
          }
          const curPhase = phaseRef.current;
          const mine = incomingRef.current;
          if (mine && mine.callId !== p.callId && (curPhase === "live" || curPhase === "connecting")) {
            return;
          }
          const next: IncomingWhatsappCall = {
            conversationId: p.conversationId,
            callId: p.callId,
            contactId: p.contactId ?? null,
            contactName: p.contactName ?? null,
            fromWa: p.fromWa ?? null,
            offerSdp:
              sdpType === "offer" && sdp
                ? sdp
                : mine?.callId === p.callId
                  ? mine.offerSdp
                  : null,
          };
          incomingRef.current = next;
          setIncoming(next);
          setErrorMsg(null);
          if (curPhase !== "live" && curPhase !== "connecting") setPhase("ringing");
          return;
        }

        const sig = (p.signalingStatus ?? "").toUpperCase();
        if (sig === "ACCEPTED" || kind === "accepted_by_agent") {
          const mine = incomingRef.current;
          const curPhase = phaseRef.current;
          if (mine && p.callId && p.callId === mine.callId && curPhase === "ringing") {
            reset();
          }
          return;
        }

        if (kind !== "terminate") return;
        const mine = incomingRef.current;
        if (!mine || !p.callId || p.callId !== mine.callId) return;
        reset();
      },
      [currentUserId, reset],
    ),
    enabled,
  );

  // Meta dá ~30–60s. Sem terminate, o overlay não pode ficar para sempre.
  React.useEffect(() => {
    if (phase !== "ringing") return;
    const t = window.setTimeout(() => {
      if (phaseRef.current === "ringing") void reject();
    }, 55_000);
    return () => window.clearTimeout(t);
  }, [phase, incoming?.callId, reject]);

  return {
    phase,
    errorMsg,
    incoming,
    remoteStream,
    muted,
    durationMs,
    answer,
    reject,
    hangup,
    toggleMute,
    reset,
  };
}
