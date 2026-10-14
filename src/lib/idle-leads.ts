/** Opções do filtro "Leads parados". Espelha o whitelist do backend. */
export const IDLE_MINUTE_OPTIONS = [
  30, 60, 120, 180, 300, 420, 600, 720, 900, 1080, 1440,
] as const;

const IDLE_SET = new Set<number>(IDLE_MINUTE_OPTIONS);

export function parseIdleMinutes(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || !IDLE_SET.has(n)) return undefined;
  return n;
}

export function idleMinutesLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} minutos`;
  const hours = minutes / 60;
  return hours === 1 ? "1 hora" : `${hours} horas`;
}
