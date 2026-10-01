import { describe, expect, it } from "vitest";

import {
  GENERIC_LOGIN_ERROR,
  isOrgSelectable,
  normalizeDisplayName,
  normalizeTenantOrgs,
  resolveLoginError,
  tenantLookupFailureMessage,
  verifyEmailHref,
} from "../login-contract";

describe("resolveLoginError — contrato antigo (códigos específicos)", () => {
  it("email_unverified mantém a mensagem e o redirect para /verify-email", () => {
    const res = resolveLoginError("email_unverified");
    expect(res.goToVerifyEmail).toBe(true);
    expect(res.offerVerifyEmailLink).toBe(false);
    expect(res.message).toMatch(/Confirme seu e-mail/);
  });

  it.each(["database_unavailable", "account_locked", "mfa_required"])(
    "%s mantém mensagem própria, sem redirect nem link",
    (code) => {
      const res = resolveLoginError(code);
      expect(res.goToVerifyEmail).toBe(false);
      expect(res.offerVerifyEmailLink).toBe(false);
      expect(res.message).not.toBe(GENERIC_LOGIN_ERROR);
    },
  );
});

describe("resolveLoginError — contrato novo", () => {
  it.each([
    "credentials",
    "invalid_credentials",
    "CredentialsSignin",
    "qualquer_codigo_novo",
    "",
    null,
    undefined,
  ])("código %j → mensagem única + link de confirmação, sem redirect automático", (code) => {
    expect(resolveLoginError(code)).toEqual({
      message: GENERIC_LOGIN_ERROR,
      goToVerifyEmail: false,
      offerVerifyEmailLink: true,
    });
  });

  it("a mensagem genérica é a combinada e não afirma que a conta existe", () => {
    expect(GENERIC_LOGIN_ERROR).toBe(
      "E-mail ou senha incorretos. Se a sua conta ainda precisa de confirmação, enviamos um novo código para o seu e-mail.",
    );
  });

  it.each(["rate_limited", "mfa_invalid"])("%s tem mensagem própria, sem link", (code) => {
    const res = resolveLoginError(code);
    expect(res.message).not.toBe(GENERIC_LOGIN_ERROR);
    expect(res.goToVerifyEmail).toBe(false);
    expect(res.offerVerifyEmailLink).toBe(false);
  });

  it("rate_limited fala em aguardar, não em senha errada", () => {
    expect(resolveLoginError("rate_limited").message).toMatch(/Muitas tentativas/);
  });
});

describe("verifyEmailHref", () => {
  it("leva o e-mail digitado, codificado", () => {
    expect(verifyEmailHref(" a+b@example.com ")).toBe("/verify-email?email=a%2Bb%40example.com");
  });

  it("sem e-mail → só a rota", () => {
    expect(verifyEmailHref("")).toBe("/verify-email");
    expect(verifyEmailHref(undefined)).toBe("/verify-email");
  });
});

describe("tenantLookupFailureMessage", () => {
  it("404 (contrato antigo e novo): conta não encontrada", () => {
    expect(tenantLookupFailureMessage(404)).toBe("Não encontramos uma conta com este e-mail.");
  });

  it("429: mensagem própria de limite, com a espera do Retry-After", () => {
    expect(tenantLookupFailureMessage(429, "30")).toBe(
      "Muitas tentativas. Aguarde 30 segundo(s) e tente novamente.",
    );
    expect(tenantLookupFailureMessage(429, "120")).toBe(
      "Muitas tentativas. Aguarde 2 minuto(s) e tente novamente.",
    );
  });

  it("429 sem Retry-After (ou inválido): mensagem genérica de espera", () => {
    for (const header of [undefined, null, "", "abc", "0"]) {
      expect(tenantLookupFailureMessage(429, header)).toBe(
        "Muitas tentativas. Aguarde um pouco e tente novamente.",
      );
    }
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
