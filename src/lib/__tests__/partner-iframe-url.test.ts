import { describe, expect, it } from "vitest";

import { isSafePartnerIframeSrc } from "../partner-iframe-url";

const opts = {
  pageOrigin: "https://acme.bwipo.com",
  apiOrigin: "https://api.bwipo.com",
  tenantBaseDomain: "bwipo.com",
};

describe("isSafePartnerIframeSrc", () => {
  it("aceita https externo do parceiro", () => {
    expect(isSafePartnerIframeSrc("https://widgets.parceiro.com/app", opts)).toBe(
      true,
    );
  });

  it("rejeita javascript, data e relativo", () => {
    expect(isSafePartnerIframeSrc("javascript:alert(1)", opts)).toBe(false);
    expect(isSafePartnerIframeSrc("data:text/html,<script></script>", opts)).toBe(
      false,
    );
    expect(isSafePartnerIframeSrc("/local-widget", opts)).toBe(false);
  });

  it("rejeita origin do CRM, da API e hosts do tenant", () => {
    expect(isSafePartnerIframeSrc("https://acme.bwipo.com/evil", opts)).toBe(false);
    expect(isSafePartnerIframeSrc("https://api.bwipo.com/widgets", opts)).toBe(
      false,
    );
    expect(isSafePartnerIframeSrc("https://bwipo.com/embed", opts)).toBe(false);
    expect(
      isSafePartnerIframeSrc("https://outro.bwipo.com/widget", opts),
    ).toBe(false);
  });

  it("em localhost só bloqueia o origin da página e da API", () => {
    const local = {
      pageOrigin: "http://localhost:3000",
      apiOrigin: "http://localhost:3001",
      tenantBaseDomain: "localhost",
    };
    expect(isSafePartnerIframeSrc("http://localhost:4000/widget", local)).toBe(
      true,
    );
    expect(isSafePartnerIframeSrc("http://localhost:3000/app", local)).toBe(
      false,
    );
  });
});
