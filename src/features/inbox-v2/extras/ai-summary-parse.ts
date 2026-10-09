/**
 * Resumo do atendimento gravado pelo agente de IA (`messageType=ai_summary`):
 * texto em linhas "Rótulo: valor". Aqui vira itens para o cartão e a linha
 * do cartão fechado ("motivo → resultado · pendência").
 */

export const SUMMARY_LABELS = [
  "Motivo",
  "O que foi feito",
  "Pendência",
  "Resultado",
  "Próximo passo",
  "Dados coletados",
  "Mensagens-chave",
] as const;

export type SummaryItem = { label: string; value: string };

const NO_PENDING = /^(nenhum|nenhuma|sem pend|—|-)/i;

export function parseSummaryContent(content: string): { items: SummaryItem[]; oneLine: string } {
  const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const items: SummaryItem[] = [];
  for (const line of lines) {
    const m = /^([^:]{2,40}):\s*(.+)$/.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    if (!SUMMARY_LABELS.some((l) => l.toLowerCase() === label.toLowerCase())) continue;
    items.push({ label, value: m[2].trim() });
  }
  const get = (label: string) => items.find((i) => i.label.toLowerCase() === label.toLowerCase())?.value ?? "";
  const motivo = get("Motivo");
  const resultado = get("Resultado");
  if (!motivo && !resultado) return { items, oneLine: lines[0] ?? "" };
  const pendencia = get("Pendência");
  const tail = pendencia && !NO_PENDING.test(pendencia) ? ` · ${pendencia}` : "";
  return { items, oneLine: `${motivo || "—"} → ${resultado || "—"}${tail}` };
}
