/**
 * Ponte leve entre a UI lateral (ex.: Enviar produto do curso) e o
 * Composer do chat — sem prop-drilling pelo ContactAside.
 *
 * No mobile o Chat pode estar desmontado (switcher Chat | Negócio). Por
 * isso guardamos o texto pendente e pedimos foco no painel Chat; o
 * Composer consome o pendente ao montar.
 */

export const COMPOSER_INSERT_EVENT = "crm:composer-insert";

/** Pede ao layout mobile abrir a aba/painel Chat. */
export const COMPOSER_FOCUS_CHAT_EVENT = "crm:composer-focus-chat";

let pendingInsertText: string | null = null;

export function insertComposerText(text: string) {
  if (typeof window === "undefined") return;
  const value = typeof text === "string" ? text : "";
  if (!value.trim()) return;

  pendingInsertText = value;
  window.dispatchEvent(new CustomEvent(COMPOSER_FOCUS_CHAT_EVENT));
  const payload = value;
  // Mobile: o Chat só monta depois do FOCUS. Atrasa o evento para o
  // composer já existir; se ainda não existir, o mount usa takePending.
  requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent(COMPOSER_INSERT_EVENT, { detail: { text: payload } }),
    );
  });
}

/** Consome texto pendente (ex.: Composer acabou de montar após trocar pra Chat). */
export function takePendingComposerInsert(): string | null {
  const next = pendingInsertText;
  pendingInsertText = null;
  return next;
}

/** Limpa pendente após o Composer ativo ter aplicado o evento. */
export function clearPendingComposerInsert() {
  pendingInsertText = null;
}
