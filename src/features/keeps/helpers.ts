import type { KeepDoc, KeepLabel, KeepNote } from "./types";

export function keepDocPlainText(doc: KeepDoc | undefined): string {
  if (!doc) return "";
  const walk = (node: unknown): string => {
    if (!node || typeof node !== "object") return "";
    const n = node as { text?: string; content?: unknown[] };
    if (typeof n.text === "string") return n.text;
    if (!Array.isArray(n.content)) return "";
    return n.content.map(walk).join(" ");
  };
  return walk(doc).replace(/\s+/g, " ").trim();
}

export function isKeepDocEmpty(doc: KeepDoc | undefined): boolean {
  return keepDocPlainText(doc).length === 0;
}

export function noteMatchesQuery(note: KeepNote, query: string, labels: KeepLabel[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [note.title, note.plainText, ...labels.map((l) => l.name)]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export const KEEP_SECTION_HEADING_CLASS =
  "mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground";
