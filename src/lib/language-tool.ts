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
  suggested: string;
  matches: ProofreadMatch[];
};

/**
 * Aplica o primeiro replacement de cada match, da direita para a esquerda,
 * para preservar offsets à esquerda. Matches sobrepostos são ignorados.
 */
export function applyLanguageToolReplacements(
  text: string,
  matches: Array<{ offset: number; length: number; replacements: string[] }>,
): string {
  const applicable = [...matches]
    .filter(
      (m) =>
        Number.isFinite(m.offset) &&
        m.offset >= 0 &&
        Number.isFinite(m.length) &&
        m.length > 0 &&
        typeof m.replacements[0] === "string",
    )
    .sort((a, b) => b.offset - a.offset);

  let result = text;
  let lastStart = Infinity;
  for (const m of applicable) {
    const end = m.offset + m.length;
    if (end > lastStart) continue;
    if (m.offset > result.length || end > result.length) continue;
    result = result.slice(0, m.offset) + m.replacements[0] + result.slice(end);
    lastStart = m.offset;
  }
  return result;
}
