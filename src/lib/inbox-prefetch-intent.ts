/**
 * Intenção de abrir o Inbox: hover/foco/toque no link do menu. O
 * `InboxConversationsPrefetch` (layout) escuta e aquece a lista +
 * contadores só então — antes aquecia em toda carga fria de qualquer rota
 * (FE-23), mesmo para quem vive no Flow e nunca abre o Inbox.
 */

export const INBOX_PREFETCH_INTENT_EVENT = "bwipo:inbox-prefetch-intent";

export function signalInboxPrefetchIntent(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INBOX_PREFETCH_INTENT_EVENT));
}

const INTENT_HANDLERS = {
  onMouseEnter: signalInboxPrefetchIntent,
  onFocus: signalInboxPrefetchIntent,
  onTouchStart: signalInboxPrefetchIntent,
} as const;

function isInboxHref(href: string): boolean {
  const path = href.split("?")[0] || href;
  return path === "/inbox" || path.startsWith("/inbox/");
}

/** Handlers para espalhar no link do menu quando ele aponta para o Inbox. */
export function inboxPrefetchIntentProps(
  href: string,
): typeof INTENT_HANDLERS | undefined {
  return isInboxHref(href) ? INTENT_HANDLERS : undefined;
}
