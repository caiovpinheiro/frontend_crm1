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
  ruleId?: string;
  categoryId?: string;
  issueType?: string;
  /** Trecho original; o dialog usa isto quando o offset não é do texto cru. */
  excerpt?: string;
};

/** Estilo formal do LT (pra→para) não serve no WhatsApp. */
const DROP_CATEGORIES = new Set([
  "FORMAL",
  "STYLE",
  "TYPOGRAPHY",
  "REDUNDANCY",
]);
const DROP_ISSUE_TYPES = new Set(["style"]);
/** Abreviações comuns de chat: o primeiro replacement do LT piora (vc→Vc.). */
const INFORMAL_KEEP = new Set([
  "vc",
  "vcs",
  "pq",
  "tb",
  "tbm",
  "blz",
  "msg",
  "td",
  "nd",
  "hj",
  "fudido",
  "fudida",
  "fudidos",
  "fudidas",
  "porra",
  "caralho",
  "merda",
  "bosta",
  "cacete",
  "pqp",
]);

/** Mantém ortografia/gramática; descarta formalidade e gíria de chat. */
export function isWhatsappUsefulMatch(
  match: Pick<
    ProofreadMatch,
    "ruleId" | "categoryId" | "issueType" | "offset" | "length"
  >,
  original: string,
): boolean {
  if (match.issueType && DROP_ISSUE_TYPES.has(match.issueType.toLowerCase())) {
    return false;
  }
  if (match.categoryId && DROP_CATEGORIES.has(match.categoryId.toUpperCase())) {
    return false;
  }
  if (match.ruleId?.toUpperCase().startsWith("FORMAL_")) return false;
  if (match.length > 0 && match.offset >= 0) {
    const excerpt = original
      .slice(match.offset, match.offset + match.length)
      .trim()
      .toLowerCase();
    if (INFORMAL_KEEP.has(excerpt)) return false;
  }
  return true;
}

export type ProofreadResult = {
  ok: boolean;
  original: string;
  suggested: string;
  matches: ProofreadMatch[];
  /** Texto em que os offsets dos matches valem (após regras do agente). */
  matchSource?: string;
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

export const PUBLIC_LANGUAGETOOL_CHECK_URL =
  "https://api.languagetool.org/v2/check";

function normalizeCheckUrl(url: string): string {
  return url.trim().replace(/\/$/, "");
}

/** Worker EasyPanel fora do ar / HTML 502 → usa a API pública. */
export function shouldFallbackLanguageTool(
  checkUrl: string,
  opts: { status?: number; body?: string; networkError?: boolean } = {},
): boolean {
  if (normalizeCheckUrl(checkUrl) === normalizeCheckUrl(PUBLIC_LANGUAGETOOL_CHECK_URL)) {
    return false;
  }
  if (opts.networkError) return true;
  if (typeof opts.status === "number" && opts.status >= 500) return true;
  const snippet = (opts.body ?? "").slice(0, 800);
  return /<!DOCTYPE|<html|Service is not reachable|easypanel/i.test(snippet);
}

/** Mensagem de toast quando o worker devolve HTML/502 do proxy (EasyPanel). */
export function describeLanguageToolHttpError(
  status: number,
  host: string,
  body: string,
): string {
  const snippet = body.slice(0, 800);
  if (
    snippet.includes("Service is not reachable") ||
    /easypanel/i.test(snippet)
  ) {
    return `EasyPanel não alcança o LanguageTool em ${host} (HTTP ${status}). O serviço precisa ser App (não Worker), porta 8010, container Java no ar.`;
  }
  if (/<!DOCTYPE|<html/i.test(snippet)) {
    return `LanguageTool (${host}) devolveu HTML em vez de JSON (HTTP ${status}). Confira LANGUAGETOOL_API_URL (.../v2/check) e se o Java está escutando.`;
  }
  return `LanguageTool (${host}) retornou HTTP ${status}.`;
}
