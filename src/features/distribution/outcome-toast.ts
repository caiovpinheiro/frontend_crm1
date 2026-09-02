import type { DistributionResult } from "./types";

export type DistributionToast =
  | { tone: "success"; message: string }
  | { tone: "info"; message: string }
  | { tone: "warning"; message: string }
  | { tone: "error"; message: string };

type DistOutcome = {
  success?: boolean;
  reason?: string | null;
  selectedUserName?: string | null;
  queued?: boolean;
};

/**
 * Toasts do kebab "Distribuir p/ departamento" e do Transferir do composer.
 * 202 `{ queued: true }` e reason QUEUED não são falha — o worker ainda
 * atribui.
 */
export function distributionOutcomeToast(
  result: DistOutcome,
  deptName?: string | null,
): DistributionToast {
  const dept = deptName?.trim() || "o departamento";
  const reason = result.reason ?? "";
  if (result.queued === true || reason === "QUEUED") {
    return {
      tone: "info",
      message: `Distribuição em andamento em ${dept}.`,
    };
  }
  if (result.success) {
    return {
      tone: "success",
      message: result.selectedUserName
        ? `Distribuído para ${result.selectedUserName} (${dept}).`
        : `Distribuído no departamento ${dept}.`,
    };
  }
  if (reason === "NO_ELIGIBLE_RESPONSIBLE") {
    return {
      tone: "warning",
      message: `Nenhum agente elegível em ${dept}. Lead enviado à fila de espera.`,
    };
  }
  if (reason === "SMART_DISTRIBUTION_NOT_ENABLED") {
    return { tone: "error", message: "Módulo de Distribuição não habilitado." };
  }
  if (reason === "NO_DEPARTMENT") {
    return {
      tone: "warning",
      message: `${dept} não está habilitado para distribuição. Lead enviado à fila de espera.`,
    };
  }
  if (reason === "RETIRED_WHATSAPP_CHANNEL") {
    return {
      tone: "error",
      message: "Este canal WhatsApp está aposentado. Não é possível distribuir.",
    };
  }
  return { tone: "error", message: "Não foi possível distribuir." };
}

export function applyDistributionToast(
  toast: {
    success: (m: string) => void;
    info: (m: string) => void;
    warning: (m: string) => void;
    error: (m: string) => void;
  },
  result: DistOutcome,
  deptName?: string | null,
): void {
  const mapped = distributionOutcomeToast(result, deptName);
  toast[mapped.tone](mapped.message);
}

export function isQueuedDistributionResult(
  raw: unknown,
): raw is DistributionResult {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as { queued?: unknown; reason?: unknown };
  return r.queued === true || r.reason === "QUEUED";
}

export function normalizeExecuteDistributionResult(
  raw: unknown,
): DistributionResult | null {
  if (isQueuedDistributionResult(raw)) {
    return {
      success: true,
      reason: "QUEUED",
      selectedUserId: null,
      selectedUserName: null,
      evaluated: [],
    };
  }
  if (
    raw &&
    typeof raw === "object" &&
    typeof (raw as DistributionResult).success === "boolean"
  ) {
    return raw as DistributionResult;
  }
  return null;
}
