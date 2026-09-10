import { RECIPIENT_META } from "./constants";
import type { CampaignRecipient } from "./types";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function fmtCsvDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR");
}

export function recipientsToCsv(items: CampaignRecipient[]): string {
  const header = [
    "Nome",
    "Telefone",
    "Status",
    "Erro",
    "Enviado em",
    "Entregue em",
    "Lido em",
    "Respondeu em",
  ];
  const lines = [header.map(csvEscape).join(",")];
  for (const row of items) {
    const status = RECIPIENT_META[row.status]?.label ?? row.status;
    lines.push(
      [
        row.contact.name,
        row.contact.phone ?? "",
        status,
        row.errorMessage ?? "",
        fmtCsvDate(row.sentAt),
        fmtCsvDate(row.deliveredAt),
        fmtCsvDate(row.readAt),
        fmtCsvDate(row.repliedAt),
      ]
        .map(csvEscape)
        .join(","),
    );
  }
  return lines.join("\r\n");
}

export function recipientReportFilename(campaignName: string, status: string): string {
  const slug = campaignName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  const filter = status ? status.toLowerCase() : "todos";
  return `relatorio-campanha-${slug || "campanha"}-${filter}.csv`;
}
