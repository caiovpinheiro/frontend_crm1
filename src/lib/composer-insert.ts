/**
 * Ponte leve entre a UI lateral (ex.: Enviar produto) e o Composer do chat —
 * sem prop-drilling pelo ContactAside.
 *
 * No mobile o Chat pode estar desmontado (switcher Chat | Negócio). Por
 * isso guardamos o payload pendente e pedimos foco no painel Chat; o
 * Composer consome o pendente ao montar.
 */

export const COMPOSER_INSERT_EVENT = "crm:composer-insert";

/** Pede ao layout mobile abrir a aba/painel Chat. */
export const COMPOSER_FOCUS_CHAT_EVENT = "crm:composer-focus-chat";

export type ComposerInsertMedia = {
  url: string;
  name?: string | null;
  mimeType?: string | null;
  /** Se true, o composer envia esta mídia antes do texto no Enter. */
  sendBeforeText?: boolean;
};

export type ComposerInsertPayload = {
  text: string;
  media?: ComposerInsertMedia[];
};

let pendingInsert: ComposerInsertPayload | null = null;

export function insertComposerText(text: string, media?: ComposerInsertMedia[]) {
  if (typeof window === "undefined") return;
  const value = typeof text === "string" ? text : "";
  const list = Array.isArray(media)
    ? media.filter((m) => typeof m?.url === "string" && m.url.trim())
    : [];
  if (!value.trim() && list.length === 0) return;

  pendingInsert = { text: value, media: list };
  window.dispatchEvent(new CustomEvent(COMPOSER_FOCUS_CHAT_EVENT));
  const payload: ComposerInsertPayload = { text: value, media: list };
  // Mobile: o Chat só monta depois do FOCUS. Atrasa o evento para o
  // composer já existir; se ainda não existir, o mount usa takePending.
  requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent(COMPOSER_INSERT_EVENT, { detail: payload }),
    );
  });
}

/** Consome payload pendente (ex.: Composer acabou de montar após trocar pra Chat). */
export function takePendingComposerInsert(): ComposerInsertPayload | null {
  const next = pendingInsert;
  pendingInsert = null;
  return next;
}

/** Limpa pendente após o Composer ativo ter aplicado o evento. */
export function clearPendingComposerInsert() {
  pendingInsert = null;
}
