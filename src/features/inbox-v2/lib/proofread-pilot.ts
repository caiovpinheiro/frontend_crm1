/**
 * Regras do agente para o corretor (neste navegador).
 * Substituições rodam antes do LanguageTool; ignore evita apontar o trecho.
 */

import { applyLanguageToolReplacements, type ProofreadMatch } from "@/lib/language-tool";

export const PROOFREAD_REPLACEMENTS_KEY = "eduit:proofread:replacements";
export const PROOFREAD_IGNORE_KEY = "eduit:proofread:ignore";

export type ProofreadReplacement = { from: string; to: string };

/** Infinitivos comuns depois de “vasta” no WhatsApp (vasta olhar → basta olhar). */
const VASTA_INF =
  "olhar|ver|vir|clicar|mandar|enviar|esperar|aguardar|fazer|falar|confirmar|entrar|sair|ligar|chamar|abrir|fechar|seguir|usar|ir|acessar|copiar|baixar|assinar|preencher|informar|responder|pagar";
const VASTA_NEXT = `${VASTA_INF}|que`;

function preserveCase(sample: string, replacement: string): string {
  if (!sample) return replacement;
  if (sample === sample.toUpperCase() && sample.length > 1) {
    return replacement.toUpperCase();
  }
  if (sample[0] === sample[0].toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function addMatch(
  text: string,
  found: ProofreadMatch[],
  occupied: Array<[number, number]>,
  offset: number,
  length: number,
  replacement: string,
  ruleId: string,
) {
  if (offset < 0 || length <= 0 || offset + length > text.length) return;
  const end = offset + length;
  if (occupied.some(([start, stop]) => offset < stop && end > start)) return;
  const excerpt = text.slice(offset, end);
  if (!excerpt || excerpt.toLowerCase() === replacement.toLowerCase()) return;
  occupied.push([offset, end]);
  found.push({
    message: "Correção automática",
    offset,
    length,
    replacements: [replacement],
    excerpt,
    ruleId,
  });
}

/**
 * O LT aceita “vasta” (adjetivo). No chat, “vasta olhar / vastaolhar” é “basta”.
 */
export function findBuiltinPtBrMatches(text: string): ProofreadMatch[] {
  const found: ProofreadMatch[] = [];
  const occupied: Array<[number, number]> = [];
  let match: RegExpExecArray | null;

  const stuck = new RegExp(`\\bvasta(${VASTA_INF})\\b`, "gi");
  while ((match = stuck.exec(text))) {
    const next = match[1] ?? "";
    addMatch(
      text,
      found,
      occupied,
      match.index,
      match[0].length,
      `${preserveCase(match[0].slice(0, 5), "basta")} ${next.toLowerCase()}`,
      "PROOFREAD_VASTA",
    );
  }

  const before = new RegExp(`\\bvasta\\b(?=\\s+(?:${VASTA_NEXT})\\b)`, "gi");
  while ((match = before.exec(text))) {
    addMatch(
      text,
      found,
      occupied,
      match.index,
      match[0].length,
      preserveCase(match[0], "basta"),
      "PROOFREAD_VASTA",
    );
  }

  const afterAdv = /\b(?:já|ja|não|nao)\s+(vasta)\b/gi;
  while ((match = afterAdv.exec(text))) {
    const word = match[1] ?? "";
    const offset = match.index + match[0].length - word.length;
    addMatch(
      text,
      found,
      occupied,
      offset,
      word.length,
      preserveCase(word, "basta"),
      "PROOFREAD_VASTA",
    );
  }

  return found.sort((a, b) => a.offset - b.offset);
}

export function findReplacementMatches(
  text: string,
  replacements: ProofreadReplacement[],
): ProofreadMatch[] {
  const pairs = replacements
    .map((item) => ({ from: item.from.trim(), to: item.to }))
    .filter((item) => item.from.length > 0)
    .sort((a, b) => b.from.length - a.from.length);
  const found: ProofreadMatch[] = [];
  const occupied: Array<[number, number]> = [];
  for (const { from, to } of pairs) {
    const re = new RegExp(escapeRegExp(from), "gi");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      addMatch(
        text,
        found,
        occupied,
        match.index,
        match[0].length,
        to,
        "PROOFREAD_REPLACEMENT",
      );
    }
  }
  return found.sort((a, b) => a.offset - b.offset);
}

export function prepareProofreadText(
  raw: string,
  replacements: ProofreadReplacement[],
  ignore: string[],
): { prepared: string; localMatches: ProofreadMatch[] } {
  const keep = (match: ProofreadMatch) =>
    !isIgnoredExcerpt(match.excerpt ?? "", ignore);
  const builtin = findBuiltinPtBrMatches(raw).filter(keep);
  const afterBuiltin = applyLanguageToolReplacements(raw, builtin);
  const custom = findReplacementMatches(afterBuiltin, replacements).filter(keep);
  const prepared = applyLanguageToolReplacements(afterBuiltin, custom);
  return { prepared, localMatches: [...builtin, ...custom] };
}

export type ProofreadPilotConfig = {
  replacements: ProofreadReplacement[];
  ignore: string[];
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeIgnoreToken(value: string): string {
  return value.trim().toLowerCase();
}

export function parseProofreadReplacements(
  raw: string | null,
): ProofreadReplacement[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) => {
        const rec = item as Record<string, unknown>;
        const from = typeof rec.from === "string" ? rec.from.trim() : "";
        const to = typeof rec.to === "string" ? rec.to : "";
        return { from, to };
      })
      .filter((item) => item.from.length > 0);
  } catch {
    return [];
  }
}

export function parseProofreadIgnore(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    const out: string[] = [];
    const seen = new Set<string>();
    for (const item of data) {
      if (typeof item !== "string") continue;
      const token = normalizeIgnoreToken(item);
      if (!token || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
    return out;
  } catch {
    return [];
  }
}

export function loadProofreadPilot(): ProofreadPilotConfig {
  if (typeof window === "undefined") {
    return { replacements: [], ignore: [] };
  }
  try {
    return {
      replacements: parseProofreadReplacements(
        window.localStorage.getItem(PROOFREAD_REPLACEMENTS_KEY),
      ),
      ignore: parseProofreadIgnore(window.localStorage.getItem(PROOFREAD_IGNORE_KEY)),
    };
  } catch {
    return { replacements: [], ignore: [] };
  }
}

export function saveProofreadPilot(config: ProofreadPilotConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    PROOFREAD_REPLACEMENTS_KEY,
    JSON.stringify(config.replacements),
  );
  window.localStorage.setItem(
    PROOFREAD_IGNORE_KEY,
    JSON.stringify(config.ignore),
  );
}

export function applyPilotReplacements(
  text: string,
  replacements: ProofreadReplacement[],
): string {
  const pairs = replacements
    .map((item) => ({ from: item.from.trim(), to: item.to }))
    .filter((item) => item.from.length > 0)
    .sort((a, b) => b.from.length - a.from.length);
  let out = text;
  for (const { from, to } of pairs) {
    out = out.replace(new RegExp(escapeRegExp(from), "gi"), to);
  }
  return out;
}

export function isIgnoredExcerpt(excerpt: string, ignore: string[]): boolean {
  const token = normalizeIgnoreToken(excerpt);
  if (!token) return false;
  return ignore.includes(token);
}
