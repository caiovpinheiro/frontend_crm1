import { checklistFromDoc } from "./keep-checklist";
import type { KeepDoc, KeepNote } from "./types";

function textFromNode(node: { text?: string; type?: string; content?: unknown[] } | undefined): string {
  if (!node) return "";
  if (node.text) return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map((c) => textFromNode(c as { text?: string; content?: unknown[] })).join("");
}

function bulletPreview(doc: KeepDoc | undefined): string | null {
  const content = doc?.content;
  if (!Array.isArray(content)) return null;
  const list = content.find((n) => n && typeof n === "object" && (n as { type?: string }).type === "bulletList") as
    | { content?: Array<{ type?: string; content?: unknown[] }> }
    | undefined;
  const items = list?.content?.filter((n) => n.type === "listItem") ?? [];
  if (!items.length) return null;
  return items.map((n) => `• ${textFromNode({ content: n.content })}`.trimEnd()).join("\n");
}

export function keepPreviewText(note: KeepNote): string {
  const checks = checklistFromDoc(note.content);
  if (checks?.some((i) => i.text.trim())) {
    return checks.map((i) => `${i.checked ? "☑" : "☐"} ${i.text}`.trimEnd()).join("\n");
  }
  return bulletPreview(note.content) ?? note.plainText;
}
