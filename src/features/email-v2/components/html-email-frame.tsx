"use client";

import * as React from "react";

/**
 * Sanitização mínima: remove scripts, iframes e event handlers inline.
 * Mantém estilos inline, cores, tabelas, imagens — críticos para
 * preservar a identidade visual de newsletters e e-mails transacionais.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son\w+\s*=\s*'[^']*'/gi, "")
    .replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
}

/**
 * Heurística para detectar e desfazer Quoted-Printable cru em mensagens
 * que foram persistidas SEM decodificação pelo parser MIME antigo.
 *
 * Sinais clássicos de QP bruto:
 *  - sequências `=XX` hex em densidade alta
 *  - soft line breaks `=\n` (linha terminando em `=`)
 *  - `=3D` representando `=`
 *
 * Quando confirmamos QP cru, decodificamos em 2 passes:
 *  1. remove soft breaks (=\n)
 *  2. converte =XX → byte; reinterpreta como UTF-8 (acentos latinos)
 */
export function decodeIfQuotedPrintable(input: string): string {
  if (!input) return input;
  // Heurística: pelo menos uma soft break OU densidade significativa de =XX
  const hasSoftBreak = /=\r?\n/.test(input);
  const qpMatches = input.match(/=[0-9A-Fa-f]{2}/g);
  const looksQp = hasSoftBreak || (qpMatches && qpMatches.length >= 3);
  if (!looksQp) return input;

  // 1. soft breaks
  const noSoft = input.replace(/=\r?\n/g, "");

  // 2. =XX → byte (string binária, cada char = 1 byte)
  const bytesString = noSoft.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  );

  // 3. Reinterpreta os bytes. Tenta UTF-8 primeiro (fatal=true rejeita
  //    sequências inválidas, como Latin1 puro com bytes 0x80–0xFF
  //    isolados); se falhar, cai para windows-1252 (superset de
  //    ISO-8859-1, cobre praticamente todos os e-mails brasileiros
  //    legados — `=FA` → ú, `=E7` → ç, `=E3` → ã).
  try {
    const len = bytesString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bytesString.charCodeAt(i) & 0xff;
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return new TextDecoder("windows-1252", { fatal: false }).decode(bytes);
    }
  } catch {
    return bytesString;
  }
}

/**
 * Substitui imagens com `cid:` (anexos inline ainda não baixados) por um
 * placeholder visual, evitando o ícone de imagem quebrada no iframe.
 * Imagens externas permanecem como estão; o navegador as carrega ou mostra
 * o fallback nativo caso estejam bloqueadas.
 */
function replaceBrokenImages(html: string): string {
  return html.replace(
    /<img\b[^>]*src=["']cid:[^"']*["'][^>]*>/gi,
    '<div style="border:1px dashed #d1d5db;border-radius:6px;padding:12px 16px;color:#6b7280;font-size:13px;background:#f9fafb;max-width:100%;margin:8px 0;min-height:44px;display:flex;align-items:center;gap:8px"><span>🖼️</span><span>Anexo inline não disponível</span></div>',
  );
}

/**
 * Pipeline de preparação do HTML bruto: decodifica QP, sanitiza e
 * substitui anexos inline por placeholders antes de renderizar no iframe.
 */
export function prepareEmailHtml(html: string): string {
  return replaceBrokenImages(sanitizeHtml(decodeIfQuotedPrintable(html)));
}

/**
 * Renderiza HTML de e-mail dentro de um iframe sandboxed (srcdoc) — mesmo
 * padrão usado por Gmail/Outlook. O CSS do e-mail fica isolado e não vaza
 * para o app, e classes de typography (prose etc.) não destroem layouts
 * baseados em tabela ou hero images.
 *
 * Auto-redimensiona pela altura real do body, com `ResizeObserver` para
 * conteúdo que cresce após carregar (imagens lazy, web fonts).
 */
export function HtmlEmailFrame({ html }: { html: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState<number>(400);

  const srcDoc = React.useMemo(() => {
    const baseStyles = `
      <meta charset="utf-8">
      <base target="_blank">
      <style>
        html, body { margin: 0; padding: 0; background: transparent; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          color: #1a1a1a;
          word-wrap: break-word;
          overflow-wrap: anywhere;
        }
        img { max-width: 100%; height: auto; }
        table { max-width: 100% !important; }
        a { color: #5b6ff5; }
        blockquote {
          margin: 12px 0;
          padding-left: 12px;
          border-left: 3px solid #e3e6f0;
          color: #5a5e72;
        }
        pre, code {
          background: #f5f6f9;
          padding: 1px 4px;
          border-radius: 4px;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        pre { padding: 10px; overflow: auto; }
      </style>
    `;
    const fixed = prepareEmailHtml(html);
    return `<!doctype html><html><head>${baseStyles}</head><body>${fixed}</body></html>`;
  }, [html]);

  const measure = React.useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight) + 24;
    setHeight(h);
  }, []);

  function handleLoad() {
    measure();
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    doc.querySelectorAll("img").forEach((img) => {
      img.addEventListener("load", measure, { once: true });
    });
    if (typeof ResizeObserver !== "undefined" && doc.body) {
      const ro = new ResizeObserver(() => measure());
      ro.observe(doc.body);
    }
  }

  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      onLoad={handleLoad}
      sandbox="allow-same-origin allow-popups"
      title="Conteúdo do e-mail"
      className="w-full border-0 block rounded-lg border border-border shadow-sm"
      style={{ height }}
    />
  );
}
