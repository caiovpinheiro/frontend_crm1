import { describe, expect, it } from "vitest";

import { docBadge, groupByMonth, mediaTotal, shortDate } from "../group-media";

describe("grupos WhatsApp — mídia, links e docs", () => {
  it("separa por mês como no WhatsApp", () => {
    const now = new Date(2026, 10, 13);
    const items = [
      { id: "a", createdAt: new Date(2026, 10, 12).toISOString() },
      { id: "b", createdAt: new Date(2026, 10, 2).toISOString() },
      { id: "c", createdAt: new Date(2026, 9, 20).toISOString() },
      { id: "d", createdAt: new Date(2025, 11, 1).toISOString() },
    ];
    expect(groupByMonth(items, now).map((s) => [s.label, s.items.map((i) => i.id)])).toEqual([
      ["Neste mês", ["a", "b"]],
      ["Outubro", ["c"]],
      ["Dezembro de 2025", ["d"]],
    ]);
  });

  it("selo do documento pela extensão (planilha guardada como zip continua XLSX)", () => {
    expect(docBadge("proposta.pdf", "application/pdf")).toEqual({ label: "PDF", color: "#ef4444" });
    expect(docBadge("data (1) (3).xlsx", "application/zip").label).toBe("XLSX");
    expect(docBadge("contrato.docx", null).label).toBe("DOCX");
    expect(docBadge(null, null).label).toBe("ARQ");
  });

  it("data curta e total", () => {
    expect(shortDate(new Date(2026, 10, 5).toISOString())).toBe("05/11");
    expect(mediaTotal({ media: 7, docs: 3, links: 2 })).toBe(12);
    expect(mediaTotal(undefined)).toBe(0);
  });
});
