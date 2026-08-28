import type { CampaignListItem, CampaignStatus } from "./types";

export function nf(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function rate(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 100);
}

export function sendProgress(c: CampaignListItem): number {
  return Math.min(100, rate(c.sentCount || 0, c.totalRecipients || 0));
}

/** YYYY-MM-DD no fuso local — chave de filtro do gráfico de volume. */
export function campaignDayKey(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function fmtDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? new Date(`${iso}T00:00:00`)
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
}

export function fmtDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const NO_METRICS: CampaignStatus[] = ["DRAFT", "SCHEDULED"];

export function isDraftLike(c: CampaignListItem): boolean {
  if (NO_METRICS.includes(c.status)) return true;
  return (c.totalRecipients || 0) === 0 && (c.sentCount || 0) === 0;
}

export function isSendingLike(c: CampaignListItem): boolean {
  return c.status === "SENDING" || c.status === "PROCESSING";
}

export function isPausable(c: CampaignListItem): boolean {
  return isSendingLike(c);
}

export function isResumable(c: CampaignListItem): boolean {
  return c.status === "PAUSED";
}

/** Status que o DELETE /api/campaigns/:id aceita. */
const DELETABLE: CampaignStatus[] = ["DRAFT", "COMPLETED", "CANCELLED", "FAILED"];

export function isDeletable(c: CampaignListItem): boolean {
  return DELETABLE.includes(c.status);
}

export function anomalies(c: CampaignListItem): string[] {
  const total = c.totalRecipients || 0;
  const sent = c.sentCount || 0;
  const failed = c.failedCount || 0;
  const out: string[] = [];
  if (sent > total && total > 0) {
    out.push(`Enviados (${nf(sent)}) excedem o total (${nf(total)})`);
  }
  if (rate(failed, total) >= 6 && total > 0) {
    out.push(`Taxa de falha alta: ${rate(failed, total)}%`);
  }
  return out;
}

export type CampaignSortKey = "readRate" | "sent" | "replyRate" | "date";

export const SORT_LABEL: Record<CampaignSortKey, string> = {
  readRate: "Taxa de leitura",
  sent: "Volume enviado",
  replyRate: "Taxa de resposta",
  date: "Data",
};

export const SORT_KEYS: CampaignSortKey[] = ["readRate", "sent", "replyRate", "date"];

function hasMetrics(c: CampaignListItem): boolean {
  return !isDraftLike(c);
}

export function sortValue(c: CampaignListItem, key: CampaignSortKey): number {
  switch (key) {
    case "readRate":
      return rate(c.readCount || 0, c.sentCount || 0);
    case "sent":
      return c.sentCount || 0;
    case "replyRate":
      return rate(c.repliedCount || 0, c.sentCount || 0);
    case "date":
      return new Date(c.createdAt).getTime();
  }
}

export function sortCampaigns(
  list: readonly CampaignListItem[],
  key: CampaignSortKey,
): CampaignListItem[] {
  return [...list].sort((a, b) => {
    if (key !== "date") {
      const aEmpty = !hasMetrics(a);
      const bEmpty = !hasMetrics(b);
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    }
    const diff = sortValue(b, key) - sortValue(a, key);
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

export function campaignSegmentLabel(c: CampaignListItem): string {
  return c.segment?.name ?? c.channel?.name ?? "—";
}
