/** MIME do MediaRecorder mais fácil de converter em nota de voz WhatsApp. */

const MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
] as const;

export const VOICE_RECORDER_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  channelCount: { ideal: 1 },
  echoCancellation: true,
  noiseSuppression: true,
};

export function pickVoiceRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  for (const mime of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    } catch {
      /* ignore */
    }
  }
  return "audio/webm";
}

export function voiceRecorderFileExt(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (base.includes("ogg")) return "ogg";
  if (base.includes("mp4") || base.includes("m4a") || base.includes("aac")) return "m4a";
  if (base.includes("mpeg") || base.includes("mp3")) return "mp3";
  return "webm";
}
