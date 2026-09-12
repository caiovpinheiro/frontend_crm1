/**
 * Tipos e helper puros do LanguageTool — usados pela rota Next
 * `/api/proofread` e pelo cliente do composer.
 */

export type ProofreadMatch = {
  message: string;
  shortMessage?: string;
  offset: number;
  length: number;
  replacements: string[];
};

export type ProofreadResult = {
  ok: boolean;
  original: string;
  suggested: string;
  matches: ProofreadMatch[];
};

/**
 * Aplica o primeiro replacement de cada match, da direita para a esquerda.
 * Inserções (`length === 0`, ex.: ponto final) entram. No-ops (replacement
 * igual ao trecho) são ignorados para não tapar pontuação no mesmo span
 * (`isso` vs `isso.`).
 */
export function applyLanguageToolReplacements(
  text: string,
  matches: Array<{ offset: number; length: number; replacements: string[] }>,
): string {
  const applicable = matches
    .filter(
      (m) =>
        Number.isFinite(m.offset) &&
        m.offset >= 0 &&
        Number.isFinite(m.length) &&
        m.length >= 0 &&
        typeof m.replacements[0] === "string" &&
        !(m.length === 0 && m.replacements[0] === ""),
    )
    .map((m) => ({
      offset: m.offset,
      length: m.length,
      replacement: m.replacements[0],
      identity:
        m.length > 0 &&
        m.replacements[0] === text.slice(m.offset, m.offset + m.length),
    }))
    .filter((m) => !m.identity)
    .sort((a, b) => {
      if (b.offset !== a.offset) return b.offset - a.offset;
      return b.length - a.length;
    });

  let result = text;
  let lastStart = Infinity;
  for (const m of applicable) {
    const end = m.offset + m.length;
    if (m.offset >= lastStart) continue;
    if (m.offset > result.length) continue;
    if (m.length > 0 && end > result.length) continue;
    result =
      result.slice(0, m.offset) +
      m.replacement +
      result.slice(m.length === 0 ? m.offset : end);
    lastStart = m.offset;
  }
  return result;
}
