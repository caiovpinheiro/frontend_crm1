import { describe, expect, it } from "vitest";

import {
  buildEmailSrcDoc,
  decodeIfQuotedPrintable,
  EMAIL_FRAME_CSP,
  EMAIL_FRAME_CSP_META,
  sanitizeEmailHtml,
} from "../lib/email-srcdoc";

describe("buildEmailSrcDoc (SEC2-7: CSP no srcdoc)", () => {
  it("injeta a meta CSP com script-src/form-action/base-uri 'none'", () => {
    const doc = buildEmailSrcDoc("<p>olá</p>");
    expect(EMAIL_FRAME_CSP).toBe("script-src 'none'; form-action 'none'; base-uri 'none'");
    expect(doc).toContain(EMAIL_FRAME_CSP_META);
    expect(doc).toContain(`http-equiv="Content-Security-Policy"`);
  });

  it("coloca a CSP logo após o charset, antes de <base> e <style>", () => {
    const doc = buildEmailSrcDoc("<p>olá</p>");
    const charset = doc.indexOf(`<meta charset="utf-8">`);
    const csp = doc.indexOf(EMAIL_FRAME_CSP_META);
    const base = doc.indexOf(`<base target="_blank">`);
    const style = doc.indexOf("<style>");
    expect(charset).toBeGreaterThanOrEqual(0);
    expect(csp).toBeGreaterThan(charset);
    expect(base).toBeGreaterThan(csp);
    expect(style).toBeGreaterThan(csp);
    // Só um <base>, sem href — `base-uri 'none'` não afeta `target`.
    expect(doc.match(/<base\b/g)).toHaveLength(1);
    expect(doc).not.toMatch(/<base[^>]*href=/);
  });

  it("mantém a estrutura do documento e o conteúdo do e-mail no body", () => {
    const doc = buildEmailSrcDoc(`<table><tr><td style="color:red">Oi</td></tr></table>`);
    expect(doc.startsWith("<!doctype html><html><head>")).toBe(true);
    expect(doc.endsWith("</body></html>")).toBe(true);
    expect(doc).toContain(`<body><table><tr><td style="color:red">Oi</td></tr></table></body>`);
  });

  it("sanitiza script/iframe/handlers antes de montar", () => {
    const doc = buildEmailSrcDoc(
      `<div onclick="x()" onmouseover='y()' onload=z()>a</div><script>alert(1)</script><iframe src="x"></iframe>`,
    );
    expect(doc).not.toContain("<script>alert(1)</script>");
    expect(doc).not.toContain("<iframe");
    expect(doc).not.toMatch(/\son(click|mouseover|load)/);
    expect(doc).toContain("<div>a</div>");
  });

  it("decodifica quoted-printable cru antes de montar", () => {
    const doc = buildEmailSrcDoc("Ol=C3=A1 a=C3=A7=C3=A3o=\r\n continua");
    expect(doc).toContain("Olá ação continua");
  });
});

describe("sanitizeEmailHtml", () => {
  it("preserva estilos inline e imagens (identidade visual)", () => {
    const html = `<img src="https://x/y.png" style="width:100px"><p style="color:#f00">x</p>`;
    expect(sanitizeEmailHtml(html)).toBe(html);
  });
});

describe("decodeIfQuotedPrintable", () => {
  it("não mexe em texto sem sinais de QP", () => {
    expect(decodeIfQuotedPrintable("a = b")).toBe("a = b");
    expect(decodeIfQuotedPrintable("")).toBe("");
  });

  it("cai para windows-1252 quando não é UTF-8 válido", () => {
    expect(decodeIfQuotedPrintable("=E7=E3=FA")).toBe("çãú");
  });
});
