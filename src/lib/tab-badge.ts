/**
 * Aviso de mensagem nova na aba do navegador: enquanto ativo, o favicon
 * vira um balão de chat no gradiente da marca com bolinha vermelha e o título ganha "(1) " — fixo, não soma
 * a cada mensagem. `setTabAlert(false)` restaura ícone e título. Estado
 * por aba (módulo).
 */

const ORIGINAL_HREF = "tabAlertOriginalHref";
const TITLE_PREFIX = "(1) ";

/** Balão de chat genérico no gradiente da Bwipo + bolinha vermelha. */
const ALERT_ICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      // Gradiente da marca: ciano → azul vibrante → roxo (diagonal).
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
      '<stop offset="0" stop-color="#00C9E8"/>' +
      '<stop offset=".45" stop-color="#0754F5"/>' +
      '<stop offset="1" stop-color="#5420EF"/>' +
      "</linearGradient></defs>" +
      '<path d="M16 3C8.8 3 3 8.4 3 15c0 2.5.8 4.8 2.2 6.7L4 29l7.6-2.3c1.3.4 2.8.6 4.4.6 7.2 0 13-5.4 13-12S23.2 3 16 3z" fill="url(#g)"/>' +
      '<circle cx="10.5" cy="15" r="1.8" fill="#fff"/>' +
      '<circle cx="16" cy="15" r="1.8" fill="#fff"/>' +
      '<circle cx="21.5" cy="15" r="1.8" fill="#fff"/>' +
      // Bolinha vermelha de "não lido" no canto, com aro branco.
      '<circle cx="25.5" cy="6.5" r="5.5" fill="#E24B4A" stroke="#fff" stroke-width="2"/>' +
      "</svg>",
  );

let active = false;

export function isTabAlertActive(): boolean {
  return active;
}

export function setTabAlert(on: boolean): void {
  if (typeof document === "undefined" || on === active) return;
  active = on;
  const base = document.title.startsWith(TITLE_PREFIX)
    ? document.title.slice(TITLE_PREFIX.length)
    : document.title;
  document.title = on ? `${TITLE_PREFIX}${base}` : base;
  const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
  for (const link of links) {
    if (on) {
      link.dataset[ORIGINAL_HREF] ??= link.href;
      link.href = ALERT_ICON;
    } else if (link.dataset[ORIGINAL_HREF]) {
      link.href = link.dataset[ORIGINAL_HREF];
      delete link.dataset[ORIGINAL_HREF];
    }
  }
}
