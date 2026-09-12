import type { ProofreadResult } from "@/lib/language-tool";

export type { ProofreadMatch, ProofreadResult } from "@/lib/language-tool";
export { applyLanguageToolReplacements } from "@/lib/language-tool";

export class ProofreadUnavailableError extends Error {
  constructor(message = "Corretor indisponível") {
    super(message);
    this.name = "ProofreadUnavailableError";
  }
}

/** POST /api/proofread — checagem síncrona no servidor Next. */
export async function proofreadText(
  text: string,
  language = "pt-BR",
): Promise<ProofreadResult> {
  const res = await fetch("/api/proofread", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language }),
  });
  const data = (await res.json().catch(() => ({}))) as ProofreadResult & {
    error?: string;
  };
  if (!res.ok) {
    throw new ProofreadUnavailableError(
      typeof data.error === "string" ? data.error : "Corretor indisponível",
    );
  }
  return {
    ok: data.ok === true || (data.matches?.length ?? 0) === 0,
    original: typeof data.original === "string" ? data.original : text,
    suggested: typeof data.suggested === "string" ? data.suggested : text,
    matches: Array.isArray(data.matches) ? data.matches : [],
  };
}
