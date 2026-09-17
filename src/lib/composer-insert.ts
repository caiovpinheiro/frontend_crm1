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

export type ComposerInsertStep = {
  text: string;
  media?: ComposerInsertMedia[];
};

export type ComposerInsertPayload = {
  text: string;
  media?: ComposerInsertMedia[];
  /** Vários produtos: o composer envia um passo por mensagem WhatsApp. */
  steps?: ComposerInsertStep[];
};

let pendingInsert: ComposerInsertPayload | null = null;

function dispatchComposerInsert(payload: ComposerInsertPayload) {
  if (typeof window === "undefined") return;
  pendingInsert = payload;
  window.dispatchEvent(new CustomEvent(COMPOSER_FOCUS_CHAT_EVENT));
  // Mobile: o Chat só monta depois do FOCUS. Atrasa o evento para o
  // composer já existir; se ainda não existir, o mount usa takePending.
  requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent(COMPOSER_INSERT_EVENT, { detail: payload }),
    );
  });
}

export function insertComposerText(text: string, media?: ComposerInsertMedia[]) {
  const value = typeof text === "string" ? text : "";
  const list = Array.isArray(media)
    ? media.filter((m) => typeof m?.url === "string" && m.url.trim())
    : [];
  if (!value.trim() && list.length === 0) return;
  dispatchComposerInsert({ text: value, media: list });
}

/** Encaminha N produtos em sequência (cada um = capa + texto). */
export function insertComposerSequence(steps: ComposerInsertStep[]) {
  const clean = steps
    .map((s) => ({
      text: typeof s.text === "string" ? s.text : "",
      media: Array.isArray(s.media)
        ? s.media.filter((m) => typeof m?.url === "string" && m.url.trim())
        : [],
    }))
    .filter((s) => s.text.trim() || s.media.length > 0);
  if (clean.length === 0) return;
  if (clean.length === 1) {
    insertComposerText(clean[0].text, clean[0].media);
    return;
  }
  dispatchComposerInsert({ text: "", media: [], steps: clean });
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
