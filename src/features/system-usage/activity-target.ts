/**
 * Classificadores puros do tracker de USO REAL.
 *
 * Regras (spec 2026-07-26-system-usage-logs):
 *   - Só conta com `document.visibilityState === "visible"`.
 *   - Interações válidas:
 *       · pointerdown em controle interativo (button, link, input, etc);
 *       · keydown em campo (input/textarea/select/contenteditable) com
 *         tecla que altera conteúdo (letra/número/Enter/Backspace/Delete/Space);
 *       · change/submit;
 *       · mudança de rota (usePathname);
 *       · rolagem do usuário (wheel/touchmove) e volta da aba ao foco,
 *         no máximo 1 a cada 5 s (`use-system-activity.ts`).
 *   - NUNCA usar mousemove, hover nem o evento `scroll` (dispara também
 *     em rolagem programática).
 *   - NUNCA coletar conteúdo digitado, seletor ou identificador do alvo.
 */

/**
 * Selector CSS de elementos que contam como "controle interativo" quando
 * clicados. É consumido pelo hook via `target.closest(...)`.
 */
export const INTERACTIVE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "textarea",
  "select",
  "label",
  "option",
  "summary",
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="tab"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
].join(",");

const TRACKABLE_TAG_NAMES = new Set([
  "BUTTON",
  "A",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "LABEL",
  "OPTION",
  "SUMMARY",
]);

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Tags historicamente interativas — testável sem DOM. */
export function isTrackableElement(tagName: string): boolean {
  return TRACKABLE_TAG_NAMES.has(tagName.toUpperCase());
}

/** Elementos "editáveis" para fins de keydown. */
export function isEditableTag(tagName: string): boolean {
  return EDITABLE_TAGS.has(tagName.toUpperCase());
}

/**
 * `key` conta como interação quando altera conteúdo do campo.
 * Ignora Shift/Ctrl/Alt/Meta puros, setas, Tab, Escape, PageUp/Down
 * e combinações com Ctrl/Meta (atalhos).
 */
export function isTrackableKey(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
}): boolean {
  if (e.ctrlKey || e.metaKey) return false;
  const k = e.key;
  // Modificadores puros
  if (
    k === "Shift" ||
    k === "Control" ||
    k === "Alt" ||
    k === "Meta" ||
    k === "CapsLock" ||
    k === "NumLock" ||
    k === "ScrollLock"
  ) {
    return false;
  }
  // Navegação
  if (
    k === "ArrowUp" ||
    k === "ArrowDown" ||
    k === "ArrowLeft" ||
    k === "ArrowRight" ||
    k === "Home" ||
    k === "End" ||
    k === "PageUp" ||
    k === "PageDown" ||
    k === "Tab" ||
    k === "Escape"
  ) {
    return false;
  }
  // F1..F24
  if (/^F([1-9]|1\d|2[0-4])$/.test(k)) return false;
  return true;
}

/**
 * Testável: retorna true se o `selector` está contido no
 * `INTERACTIVE_SELECTOR`. Não é uma implementação real de
 * matcher CSS — o hook usa `element.closest()` em runtime.
 */
export function matchesInteractiveSelector(
  selector: string,
  needle: string,
): boolean {
  return selector.split(",").map((s) => s.trim()).includes(needle);
}
