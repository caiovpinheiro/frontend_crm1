import type { ComponentType } from "react";

export type AutomationRunStatus = "completed" | "failed" | "running" | "paused";

export type StepTone =
  | "emerald"
  | "sky"
  | "indigo"
  | "violet"
  | "amber"
  | "rose"
  | "slate";

export const toneClasses: Record<StepTone, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-sky-600",
  indigo: "bg-indigo-50 text-indigo-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-muted text-muted-foreground",
};

export type AutomationStep = {
  icon: ComponentType<{ className?: string; size?: number }>;
  label: string;
  tone: StepTone;
};

export type AutomationHistoryItem = {
  id: string;
  date: string;
  duration: string;
  status: AutomationRunStatus;
};

export type Automation = {
  title: string;
  status: AutomationRunStatus;
  steps: AutomationStep[];
  stats: {
    passos: number | string;
    execucoes: number;
    taxaSucesso: number | null;
  };
  history: AutomationHistoryItem[];
};

export const STATUS_DOT: Record<
  AutomationRunStatus,
  { label: string; dot: string }
> = {
  completed: { label: "Concluída", dot: "bg-emerald-500" },
  failed: { label: "Falhou", dot: "bg-rose-500" },
  running: { label: "Andamento", dot: "bg-amber-500" },
  paused: { label: "Pausada", dot: "bg-amber-500" },
};

export function rowStatusToRunStatus(
  status: "RUNNING" | "PAUSED" | "COMPLETED" | "TIMED_OUT",
): AutomationRunStatus {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "TIMED_OUT":
      return "failed";
    case "PAUSED":
      return "paused";
    default:
      return "running";
  }
}

export function blockColorToTone(color: string): StepTone {
  switch (color) {
    case "green":
    case "teal":
      return "emerald";
    case "blue":
      return "sky";
    case "indigo":
      return "indigo";
    case "violet":
    case "pink":
      return "violet";
    case "amber":
    case "orange":
      return "amber";
    case "red":
      return "rose";
    default:
      return "slate";
  }
}
