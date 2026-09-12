const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Extrai endereços de "Ana <ana@x.com>, joao@y.com; maria@z.com". */
export function parseEmailAddresses(raw: string): string[] {
  const parts = raw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean);
  const found: string[] = [];
  for (const part of parts) {
    const angled = part.match(/<([^>]+)>/);
    const candidate = (angled?.[1] ?? part).trim();
    const match = candidate.match(EMAIL_RE);
    if (match?.[0]) found.push(match[0]);
  }
  return [...new Set(found)];
}

export function isBlankEmailBody(html?: string, text?: string): boolean {
  const fromText = (text ?? "").replace(/\u00a0/g, " ").trim();
  if (fromText) return false;
  const fromHtml = (html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return !fromHtml;
}
