"use client";

import * as React from "react";

import { buildEmailSrcDoc, decodeIfQuotedPrintable } from "../lib/email-srcdoc";

// Re-export: outros componentes (email-list, email-reader, ...) importam daqui.
export { decodeIfQuotedPrintable };

/**
 * Renderiza HTML de e-mail dentro de um iframe sandboxed (srcdoc) — mesmo
 * padrão usado por Gmail/Outlook. O CSS do e-mail fica isolado e não vaza
 * para o app, e classes de typography (prose etc.) não destroem layouts
 * baseados em tabela ou hero images.
 *
 * O documento leva uma CSP `script-src 'none'; form-action 'none';
 * base-uri 'none'` (ver `../lib/email-srcdoc`) como segunda camada além do
 * `sandbox` sem `allow-scripts`.
 *
 * Auto-redimensiona pela altura real do body, com `ResizeObserver` para
 * conteúdo que cresce após carregar (imagens lazy, web fonts).
 */
export function HtmlEmailFrame({ html }: { html: string }) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState<number>(400);

  const srcDoc = React.useMemo(() => buildEmailSrcDoc(html), [html]);

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

  // SEGURANÇA (SEC2-7): NUNCA adicione `allow-scripts` a este sandbox.
  // Com `allow-same-origin` o srcdoc herda a ORIGEM AUTENTICADA do app;
  // `allow-scripts` + `allow-same-origin` = qualquer e-mail que escape do
  // sanitizador (regex) vira XSS com acesso a cookies/DOM do CRM. Precisa
  // de `allow-same-origin` só para o auto-resize (`contentDocument`). Se um
  // dia scripts forem necessários, remova `allow-same-origin` e meça a
  // altura via `postMessage`.
  return (
    <iframe
      ref={iframeRef}
      srcDoc={srcDoc}
      onLoad={handleLoad}
      sandbox="allow-same-origin allow-popups"
      title="Conteúdo do e-mail"
      className="w-full border-0 block"
      style={{ height }}
    />
  );
}
