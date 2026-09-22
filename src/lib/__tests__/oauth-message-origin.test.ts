import { describe, expect, it } from "vitest";

import { isAllowedOAuthPopupOrigin } from "../oauth-message-origin";

describe("isAllowedOAuthPopupOrigin", () => {
  it("aceita o origin da página (rewrite same-origin)", () => {
    expect(
      isAllowedOAuthPopupOrigin("https://acme.bwipo.com", {
        pageOrigin: "https://acme.bwipo.com",
      }),
    ).toBe(true);
  });

  it("aceita o origin da API quando configurado", () => {
    expect(
      isAllowedOAuthPopupOrigin("https://api.bwipo.com", {
        pageOrigin: "https://acme.bwipo.com",
        apiBaseUrl: "https://api.bwipo.com",
      }),
    ).toBe(true);
  });

  it("rejeita origens de terceiros", () => {
    expect(
      isAllowedOAuthPopupOrigin("https://evil.example", {
        pageOrigin: "https://acme.bwipo.com",
        apiBaseUrl: "https://api.bwipo.com",
      }),
    ).toBe(false);
    expect(
      isAllowedOAuthPopupOrigin("https://www.instagram.com", {
        pageOrigin: "https://acme.bwipo.com",
        apiBaseUrl: "https://api.bwipo.com",
      }),
    ).toBe(false);
  });
});
