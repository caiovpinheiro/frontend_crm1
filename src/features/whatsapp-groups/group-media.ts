/** Utilitários da tela "Mídia, links e docs" do grupo. */

export type MonthSection<T> = { key: string; label: string; items: T[] };

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Separa por mês como no WhatsApp: "Neste mês", "Outubro", "Dezembro de 2025". */
export function groupByMonth<T extends { createdAt: string }>(items: T[], now = new Date()): MonthSection<T>[] {
  const out: MonthSection<T>[] = [];
  for (const item of items) {
    const d = new Date(item.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    let section = out[out.length - 1];
    if (!section || section.key !== key) {
      const sameMonth = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      const label = sameMonth
        ? "Neste mês"
        : d.getFullYear() === now.getFullYear()
          ? MONTHS[d.getMonth()]!
          : `${MONTHS[d.getMonth()]} de ${d.getFullYear()}`;
      section = { key, label, items: [] };
      out.push(section);
    }
    section.items.push(item);
  }
  return out;
}

/** Selo do documento pela extensão (cor como nos apps de arquivo). */
export function docBadge(fileName: string | null, mime: string | null): { label: string; color: string } {
  const ext = (fileName?.split(".").pop() ?? "").toLowerCase();
  const m = (mime ?? "").toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return { label: "PDF", color: "#ef4444" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext) || m.includes("spreadsheet") || m.includes("excel"))
    return { label: ext ? ext.toUpperCase().slice(0, 4) : "XLS", color: "#16a34a" };
  if (["doc", "docx", "odt", "rtf", "txt"].includes(ext) || m.includes("word"))
    return { label: ext ? ext.toUpperCase().slice(0, 4) : "DOC", color: "#2563eb" };
  if (["ppt", "pptx", "odp"].includes(ext) || m.includes("presentation"))
    return { label: ext.toUpperCase().slice(0, 4) || "PPT", color: "#ea580c" };
  if (["zip", "rar", "7z"].includes(ext) || m.includes("zip")) return { label: "ZIP", color: "#7c3aed" };
  return { label: ext ? ext.toUpperCase().slice(0, 4) : "ARQ", color: "#64748b" };
}

/** "13/11" para a linha do documento/link. */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Total exibido ao lado de "Mídia, links e docs". */
export function mediaTotal(c: { media: number; docs: number; links: number } | undefined): number {
  return c ? c.media + c.docs + c.links : 0;
}
