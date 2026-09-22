import { describe, expect, it } from "vitest";

import { isSafeHref, isSafeLogoUrl } from "../safe-href";

describe("isSafeHref", () => {
  it("aceita http(s), mailto e tel", () => {
    expect(isSafeHref("https://example.com/a")).toBe(true);
    expect(isSafeHref("http://example.com")).toBe(true);
    expect(isSafeHref("mailto:ops@example.com")).toBe(true);
    expect(isSafeHref("tel:+5511999999999")).toBe(true);
    expect(isSafeHref("/contacts/abc")).toBe(true);
  });

  it("rejeita protocolos ativos", () => {
    expect(isSafeHref("javascript:alert(1)")).toBe(false);
    expect(isSafeHref("JAVASCRIPT:alert(1)")).toBe(false);
    expect(isSafeHref("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isSafeHref("vbscript:msgbox(1)")).toBe(false);
    expect(isSafeHref("blob:https://example.com/uuid")).toBe(false);
  });
});

describe("isSafeLogoUrl", () => {
  it("rejeita SVG, data URL e javascript", () => {
    expect(isSafeLogoUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeLogoUrl("data:image/svg+xml,<svg></svg>")).toBe(false);
    expect(isSafeLogoUrl("https://cdn.example.com/logo.svg")).toBe(false);
  });

  it("aceita https raster e path de storage branding", () => {
    expect(isSafeLogoUrl("https://cdn.example.com/logo.png")).toBe(true);
    expect(
      isSafeLogoUrl("/api/storage/clxxxxxxxxxxxxxxxxxxxxxxxxx/branding/logo.jpg"),
    ).toBe(true);
  });
});
