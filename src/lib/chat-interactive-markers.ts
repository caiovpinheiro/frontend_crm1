/**
 * Marcadores que o automation-executor grava no histórico do chat
 * (`${corpo}\n[Botões: A, B]` / `${corpo}\n[Lista: A, B]`). Não vão
 * para o WhatsApp — só para o CRM desenhar as opções.
 */

const INTERACTIVE_MARKER_RE = /\n?\[(?:Bot[õo]es|Lista):\s*([^\]]+)\]\s*$/i;

export function parseChatInteractiveMarkers(content: string): {
  text: string;
  buttons?: string[];
} {
  const m = content.match(INTERACTIVE_MARKER_RE);
  if (!m || m.index == null) return { text: content };
  const buttons = m[1]
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
  const text = content.slice(0, m.index).trimEnd();
  return { text, buttons: buttons.length ? buttons : undefined };
}

export function stripChatInteractiveMarkers(content: string): string {
  return content.replace(INTERACTIVE_MARKER_RE, "").trimEnd();
}
