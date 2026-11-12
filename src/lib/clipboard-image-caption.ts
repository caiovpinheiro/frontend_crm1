/**
 * Helpers para colagem de imagem + texto (ex.: um único ClipboardItem com
 * `image/png` + `text/plain`, como o botão "Copiar foto e texto"). O texto
 * vai para o campo do composer e, no envio, vira a legenda da imagem em vez
 * de ser descartado.
 */

/** Lê o `text/plain` de um DataTransfer de paste; "" quando ausente/só espaços. */
export function readPastedPlainText(cd: Pick<DataTransfer, "getData"> | null | undefined): string {
  if (!cd) return "";
  try {
    return (cd.getData("text/plain") ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Insere `text` na seleção [start, end) de `value` (como um paste nativo).
 * Retorna o novo valor e a posição do cursor após o texto inserido.
 */
export function insertAtSelection(
  value: string,
  start: number | null | undefined,
  end: number | null | undefined,
  text: string,
): { value: string; caret: number } {
  const s = Math.max(0, Math.min(start ?? value.length, value.length));
  const e = Math.max(s, Math.min(end ?? s, value.length));
  return { value: value.slice(0, s) + text + value.slice(e), caret: s + text.length };
}
