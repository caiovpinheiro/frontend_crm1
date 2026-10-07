/*
 * Relógio dos tempos do Dashboard (global da aba Atendimentos): comercial conta
 * só o horário de atendimento; corrido conta as 24h. Escolha persistida em
 * `DashboardUiState.clock`. Os cards que dependem dele mostram o rótulo.
 */

export type DashboardClock = "business" | "elapsed";

export const CLOCK_OPTIONS: { value: DashboardClock; label: string }[] = [
  { value: "business", label: "Comercial" },
  { value: "elapsed", label: "Corrido" },
];

export function clockLabel(clock: DashboardClock): string {
  return clock === "business" ? "relógio comercial" : "relógio corrido";
}

/** Acrescenta o rótulo do relógio ao subtítulo do card. */
export function withClock(text: string, clock: DashboardClock): string {
  return `${text} · ${clockLabel(clock)}`;
}
