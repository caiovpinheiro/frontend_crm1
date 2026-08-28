import type { CampaignStatus, RecipientStatus } from "./types";

/** Tom semântico usado para colorir badges/pills no DS glass. */
export type StatusTone =
  | "neutral"
  | "info"
  | "brand"
  | "success"
  | "warning"
  | "danger";

export const STATUS_META: Record<
  CampaignStatus,
  { label: string; tone: StatusTone }
> = {
  DRAFT: { label: "Rascunho", tone: "neutral" },
  SCHEDULED: { label: "Agendada", tone: "info" },
  PROCESSING: { label: "Processando", tone: "brand" },
  SENDING: { label: "Enviando", tone: "brand" },
  PAUSED: { label: "Pausada", tone: "warning" },
  COMPLETED: { label: "Concluída", tone: "success" },
  CANCELLED: { label: "Cancelada", tone: "neutral" },
  FAILED: { label: "Falhou", tone: "danger" },
};

export const RECIPIENT_META: Record<
  RecipientStatus,
  { label: string; tone: StatusTone }
> = {
  PENDING: { label: "Pendente", tone: "neutral" },
  SENDING: { label: "Enviando", tone: "info" },
  SENT: { label: "Enviado", tone: "success" },
  DELIVERED: { label: "Entregue", tone: "success" },
  READ: { label: "Lido", tone: "brand" },
  FAILED: { label: "Falhou", tone: "danger" },
};

export const TONE_CLASSES: Record<StatusTone, string> = {
  neutral:
    "border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-secondary)]",
  info: "border-[color-mix(in_srgb,var(--color-info)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-info)_12%,transparent)] text-[var(--color-info)]",
  brand:
    "border-[color-mix(in_srgb,var(--brand-primary)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand-primary)_10%,transparent)] text-[var(--brand-primary)]",
  success:
    "border-[color-mix(in_srgb,var(--color-success)_30%,transparent)] bg-[var(--color-success-bg)] text-[var(--color-success-text)]",
  warning:
    "border-[color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] text-[var(--color-warning)]",
  danger:
    "border-[color-mix(in_srgb,var(--color-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger-text)]",
};

/** Pills de status no DNA da lista (tokens, sem hex). */
export const STATUS_CHIP_CLASS: Record<CampaignStatus, string> = {
  DRAFT: "bg-secondary text-muted-foreground",
  SCHEDULED: "bg-chip-violet-soft text-chip-violet",
  PROCESSING: "bg-chip-blue-soft text-chip-blue",
  SENDING: "bg-chip-blue-soft text-chip-blue",
  PAUSED: "bg-warning-soft text-warning",
  COMPLETED: "bg-success-soft text-success",
  CANCELLED: "bg-secondary text-muted-foreground",
  FAILED: "bg-chip-red-soft text-chip-red",
};

export const RECIPIENT_CHIP_CLASS: Record<RecipientStatus, string> = {
  PENDING: "bg-secondary text-muted-foreground",
  SENDING: "bg-chip-blue-soft text-chip-blue",
  SENT: "bg-success-soft text-success",
  DELIVERED: "bg-success-soft text-success",
  READ: "bg-chip-blue-soft text-chip-blue",
  FAILED: "bg-chip-red-soft text-chip-red",
};

export const CAMPAIGN_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "Todas" },
  { value: "DRAFT", label: "Rascunho" },
  { value: "SCHEDULED", label: "Agendada" },
  { value: "SENDING", label: "Enviando" },
  { value: "PAUSED", label: "Pausada" },
  { value: "COMPLETED", label: "Concluída" },
  { value: "FAILED", label: "Falhou" },
];
