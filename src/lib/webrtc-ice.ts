/**
 * ICE para WebRTC no browser. Opcional: TURN na rede restrita.
 * Defina no `.env` local / deploy, ex.:
 * NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON=[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:...","username":"u","credential":"p"}]
 */
export function getBrowserIceServers(): RTCIceServer[] {
  if (typeof window === "undefined") {
    return [{ urls: "stun:stun.l.google.com:19302" }];
  }
  try {
    const raw = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS_JSON?.trim();
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed as RTCIceServer[];
      }
    }
  } catch {
    /* ignore invalid JSON */
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}

export function waitIceGatheringComplete(pc: RTCPeerConnection, timeoutMs = 12_000): Promise<void> {
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
