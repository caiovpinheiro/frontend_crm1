/**
 * Montagem do documento (`srcdoc`) renderizado pelo iframe de e-mail.
 *
 * Módulo puro (sem React/DOM) para ser testável em vitest (node). O
 * componente `HtmlEmailFrame` só consome `buildEmailSrcDoc`.
 */

/**
 * CSP embutida no documento do e-mail (SEC2-7). Segunda camada de defesa,
 * somada ao `sandbox` sem `allow-scripts` do iframe:
 *
 *  - `script-src 'none'`: nenhum script executa mesmo que o sanitizador por
 *    regex deixe algo passar (ou que um browser execute algo "sem script").
 *  - `form-action 'none'`: formulários do e-mail não conseguem postar dados
 *    (phishing dentro do iframe).
 *  - `base-uri 'none'`: o e-mail não redefine a URL base do documento. O
 *    `<base target="_blank">` abaixo não tem `href`, então não é afetado.
 *
 * Imagens remotas NÃO são bloqueadas aqui de propósito: bloquear por padrão
 * ("carregar imagens") é decisão de produto, tratada separadamente.
 */
export const EMAIL_FRAME_CSP = "script-src 'none'; form-action 'none'; base-uri 'none'";

export const EMAIL_FRAME_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${EMAIL_FRAME_CSP}">`;

/**
 * Sanitização mínima: remove scripts, iframes e event handlers inline.
 * Mantém estilos inline, cores, tabelas, imagens — críticos para
 * preservar a identidade visual de newsletters e e-mails transacionais.
 *
 * É regex, portanto contornável: a contenção real vem do `sandbox` sem
 * `allow-scripts` e da CSP `script-src 'none'` injetada no documento.
 */
export function sanitizeEmailHtml(html: string): string {
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

const BASE_STYLES = `
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

/**
 * Documento completo para o `srcdoc` do iframe. A CSP vai logo depois do
 * `<meta charset>` (antes de qualquer outro elemento) para valer sobre todo
 * o restante do documento, inclusive o `<style>` e o corpo do e-mail.
 */
export function buildEmailSrcDoc(html: string): string {
  const head = `<meta charset="utf-8">${EMAIL_FRAME_CSP_META}<base target="_blank">${BASE_STYLES}`;
  const fixed = decodeIfQuotedPrintable(html);
  return `<!doctype html><html><head>${head}</head><body>${sanitizeEmailHtml(fixed)}</body></html>`;
}
