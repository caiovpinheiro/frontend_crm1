import { describe, expect, it } from "vitest";

import {
  GENERIC_LOGIN_ERROR,
  isOrgSelectable,
  normalizeDisplayName,
  normalizeTenantOrgs,
  resolveLoginError,
} from "../login-contract";

describe("resolveLoginError — contrato antigo (códigos específicos)", () => {
  it("email_unverified mantém a mensagem e o redirect para /verify-email", () => {
    const res = resolveLoginError("email_unverified");
    expect(res.goToVerifyEmail).toBe(true);
    expect(res.message).toMatch(/Confirme seu e-mail/);
  });

  it.each(["database_unavailable", "account_locked", "mfa_required"])(
    "%s mantém mensagem própria, sem redirect",
    (code) => {
      const res = resolveLoginError(code);
      expect(res.goToVerifyEmail).toBe(false);
      expect(res.message).not.toBe(GENERIC_LOGIN_ERROR);
    },
  );
});

describe("resolveLoginError — contrato novo (código único genérico)", () => {
  it.each([
    "credentials",
    "invalid_credentials",
    "CredentialsSignin",
    "qualquer_codigo_novo",
    "",
    null,
    undefined,
  ])("código %j → mensagem única, sem redirect", (code) => {
    expect(resolveLoginError(code)).toEqual({
      message: GENERIC_LOGIN_ERROR,
      goToVerifyEmail: false,
    });
  });

  it("a mensagem genérica é a combinada e não afirma que a conta existe", () => {
    expect(GENERIC_LOGIN_ERROR).toBe(
      "E-mail ou senha incorretos. Se a conta existir e ainda precisar de verificação, enviamos um novo e-mail.",
    );
  });
});

describe("normalizeTenantOrgs", () => {
  it("contrato antigo: preserva name e status", () => {
    expect(
      normalizeTenantOrgs([
        { slug: "acme", name: "Acme", status: "ACTIVE" },
        { slug: "beta", name: "Beta", status: "ARCHIVED" },
      ]),
    ).toEqual([
      { slug: "acme", name: "Acme", status: "ACTIVE" },
      { slug: "beta", name: "Beta", status: "ARCHIVED" },
    ]);
  });

  it("contrato novo: sem name/status → name cai no slug, status null (nunca undefined)", () => {
    const orgs = normalizeTenantOrgs([
      { slug: "acme" },
      { slug: "beta", name: null, status: undefined },
    ]);
    expect(orgs).toEqual([
      { slug: "acme", name: "acme", status: null },
      { slug: "beta", name: "beta", status: null },
    ]);
    for (const org of orgs) {
      expect(org.name).not.toBe("undefined");
      expect(org.name).toBeTruthy();
    }
  });

  it("aceita lista só de slugs e descarta lixo/duplicatas", () => {
    expect(
      normalizeTenantOrgs(["acme", { slug: "acme" }, { name: "sem slug" }, null, 7, { slug: "  " }]),
    ).toEqual([{ slug: "acme", name: "acme", status: null }]);
  });

  it("orgs ausente ou de tipo errado → lista vazia", () => {
    expect(normalizeTenantOrgs(undefined)).toEqual([]);
    expect(normalizeTenantOrgs(null)).toEqual([]);
    expect(normalizeTenantOrgs({ slug: "acme" })).toEqual([]);
  });
});

describe("normalizeDisplayName", () => {
  it("devolve o nome quando vem (contrato antigo)", () => {
    expect(normalizeDisplayName(" Maria ")).toBe("Maria");
  });

  it("ausente, vazio ou não-string → null (contrato novo)", () => {
    expect(normalizeDisplayName(undefined)).toBeNull();
    expect(normalizeDisplayName(null)).toBeNull();
    expect(normalizeDisplayName("   ")).toBeNull();
    expect(normalizeDisplayName(42)).toBeNull();
  });
});

describe("isOrgSelectable", () => {
  it("com status: só ACTIVE", () => {
    expect(isOrgSelectable({ status: "ACTIVE" })).toBe(true);
    expect(isOrgSelectable({ status: "ARCHIVED" })).toBe(false);
  });

  it("sem status (contrato novo): deixa seguir, o backend decide no login", () => {
    expect(isOrgSelectable({ status: null })).toBe(true);
  });
});
