/**
 * Regras do agente para o corretor (neste navegador).
 * Substituições rodam antes do LanguageTool; ignore evita apontar o trecho.
 */

export const PROOFREAD_REPLACEMENTS_KEY = "eduit:proofread:replacements";
export const PROOFREAD_IGNORE_KEY = "eduit:proofread:ignore";

export type ProofreadReplacement = { from: string; to: string };

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

function parseReplacements(raw: string | null): ProofreadReplacement[] {
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

function parseIgnore(raw: string | null): string[] {
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
      replacements: parseReplacements(
        window.localStorage.getItem(PROOFREAD_REPLACEMENTS_KEY),
      ),
      ignore: parseIgnore(window.localStorage.getItem(PROOFREAD_IGNORE_KEY)),
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
