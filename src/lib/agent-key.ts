/**
 * Helpers puros para validação de chaves OpenAI.
 * Vive em .ts (sem JSX) para poder ser importado em testes unitários.
 */

/**
 * Cópia de PDF, WhatsApp, `.env` ou gerenciador de senha traz lixo
 * (aspas, `Bearer`, quebra de linha, hífen tipográfico). A chave real
 * não tem espaço — removemos isso antes de validar.
 */
export function sanitizeOpenAiApiKey(raw: string): string {
  return raw
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/^(?:Bearer\s+|OPENAI_API_KEY\s*=\s*)/i, "")
    .replace(/^["']+|["']+$/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\s\r\n]+/g, "");
}

/** Aceita `sk-…`, `sk-proj-…` e `sk-svcacct-…`. */
export function looksLikeOpenAiApiKey(raw: string): boolean {
  const key = sanitizeOpenAiApiKey(raw);
  return /^sk-[A-Za-z0-9._~+/-]{10,}$/.test(key);
}

/** Últimos 4 chars da chave — só pra exibição na UI. */
export function apiKeyHint(rawKey: string): string {
  const k = sanitizeOpenAiApiKey(rawKey) || rawKey.trim();
  return k.length >= 4 ? k.slice(-4) : "";
}
