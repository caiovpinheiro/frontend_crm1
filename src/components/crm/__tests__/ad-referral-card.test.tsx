import { describe, expect, it } from "vitest";

import { MessageBubble } from "../message-bubble";
import { pickAdImage, safeAdHref } from "@/lib/ad-referral";
import { makeMessage, renderStatic } from "./chat-test-utils";

const TEXT = "Olá! Posso ter mais informações sobre isso?";

describe("card do anúncio Meta", () => {
  it("mensagem sem referral mantém o texto e não mostra card", () => {
    const html = renderStatic(
      <MessageBubble message={makeMessage({ id: "plain", content: TEXT })} />,
    );
    expect(html).toContain(TEXT);
    expect(html).not.toContain("data-ad-referral");
  });

  it("mensagem com referral renderiza o card antes do texto", () => {
    const html = renderStatic(
      <MessageBubble
        message={makeMessage({
          id: "ad",
          content: TEXT,
          referral: {
            sourceType: "ad",
            sourceId: "120",
            headline: "Terapia Ocupacional",
            body: "R$ 340/mês",
            sourceUrl: "https://fb.me/2aaYyDdMi0",
            imageUrl: "https://cdn.example/ad.jpg",
          },
        })}
      />,
    );
    expect(html).toContain("data-ad-referral");
    expect(html).toContain("Anúncio Meta");
    expect(html).toContain("Terapia Ocupacional");
    expect(html).toContain("R$ 340/mês");
    expect(html.indexOf("data-ad-referral")).toBeLessThan(html.indexOf(TEXT));
  });

  it("storedImageUrl tem prioridade sobre imageUrl", () => {
    const referral = {
      sourceType: "ad",
      sourceId: "120",
      storedImageUrl: "/api/storage/org/inbound-media/stored-ad.jpg",
      imageUrl: "https://cdn.example/original.jpg",
    };
    expect(pickAdImage(referral)).toBe(referral.storedImageUrl);
    const html = renderStatic(
      <MessageBubble
        message={makeMessage({
          id: "prio",
          content: TEXT,
          referral,
        })}
      />,
    );
    expect(html).toContain("stored-ad.jpg");
    expect(html).not.toContain("original.jpg");
  });

  it("sem imagem o card continua", () => {
    const html = renderStatic(
      <MessageBubble
        message={makeMessage({
          id: "text-only",
          content: TEXT,
          referral: {
            sourceType: "ad",
            headline: "Terapia Ocupacional",
            sourceUrl: "https://fb.me/2aaYyDdMi0",
          },
        })}
      />,
    );
    expect(html).toContain("data-ad-referral");
    expect(html).toContain("Terapia Ocupacional");
    expect(html).not.toContain("<img");
  });

  it("sourceUrl vira link seguro", () => {
    const html = renderStatic(
      <MessageBubble
        message={makeMessage({
          id: "link",
          content: TEXT,
          referral: {
            sourceId: "120",
            headline: "Curso",
            sourceUrl: "https://fb.me/2aaYyDdMi0",
          },
        })}
      />,
    );
    expect(html).toContain('href="https://fb.me/2aaYyDdMi0"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(safeAdHref("javascript:alert(1)")).toBeNull();
    const blocked = renderStatic(
      <MessageBubble
        message={makeMessage({
          id: "bad",
          content: TEXT,
          referral: {
            sourceId: "120",
            headline: "Curso",
            sourceUrl: "javascript:alert(1)",
          },
        })}
      />,
    );
    expect(blocked).not.toContain("javascript:");
    expect(blocked).not.toContain("Ver anúncio");
  });
});
