import { describe, expect, it } from "vitest";

import { MessageBubble, audioMp3Url, nextAudioSourceAfterError } from "../message-bubble";
import { makeMessage, renderStatic } from "./chat-test-utils";

describe("áudio — MP3 do backend como fallback/download (b3-vi)", () => {
  it("audioMp3Url aponta para /api/media/audio-mp3 com url e nome codificados", () => {
    const u = audioMp3Url("/uploads/org/voz.ogg?x=1&y=2", "audio-whatsapp");
    expect(u).toContain("/api/media/audio-mp3?");
    const qs = new URLSearchParams(u.split("?")[1]);
    expect(qs.get("url")).toBe("/uploads/org/voz.ogg?x=1&y=2");
    expect(qs.get("name")).toBe("audio-whatsapp");
  });

  it("nextAudioSourceAfterError: original → MP3; já no MP3 → null (sem loop); sem URL → null", () => {
    const original = "/uploads/org/voz.ogg";
    const mp3 = nextAudioSourceAfterError(original, original);
    expect(mp3).toBe(audioMp3Url(original, "audio"));
    expect(nextAudioSourceAfterError(mp3, original)).toBeNull();
    expect(nextAudioSourceAfterError(null, null)).toBeNull();
  });

  it("bolha de áudio renderiza o player com transcrição e download", () => {
    const html = renderStatic(
      <MessageBubble message={makeMessage({ id: "a", messageType: "audio", mediaUrl: "/uploads/org/voz.ogg" })} />,
    );
    expect(html).toContain('aria-label="Reproduzir áudio"');
    expect(html).toContain('aria-label="Baixar áudio"');
    expect(html).toContain("Transcrever");
  });
});
