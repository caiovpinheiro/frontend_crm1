/*
 * Cores vindas dos tokens do DS (`src/app/globals.css`), nunca hex: os valores
 * mudam entre tema claro e escuro. São strings `var(--token)` porque o recharts
 * aplica esses valores direto em atributos SVG (`fill`, `stroke`), onde uma
 * classe do Tailwind não chega.
 *
 * A paleta categórica (canais, categorias de tabulação) é a mesma dos outros
 * gráficos do painel — ver `categoricalColor`.
 */

export const chartColors = {
  accent: 'var(--color-primary)',
  muted: 'var(--color-muted-foreground)',
  /** Fundo das barras de progresso e linhas de grade. */
  track: 'var(--border)',
  grid: 'var(--border)',
  axis: 'var(--color-muted-foreground)',
  surface: 'var(--card)',
  text: 'var(--foreground)',
  status: {
    good: {
      fill: 'var(--color-success)',
      bg: 'var(--color-success-bg)',
      fg: 'var(--color-success-text)',
    },
    warn: {
      fill: 'var(--color-warn)',
      bg: 'var(--color-warn-bg)',
      fg: 'var(--color-warn)',
    },
    bad: {
      fill: 'var(--color-danger-text)',
      bg: 'var(--color-danger-bg)',
      fg: 'var(--color-danger-text)',
    },
  },
} as const;

export type Status = keyof typeof chartColors.status;

/** Metas em MINUTOS. Ajuste ao SLA real (ou traga do backend). */
export const slaMinutes = {
  firstResponse: { good: 20, warn: 30 },
  start: { good: 10, warn: 15 },
  duration: { good: 10 * 60, warn: 16 * 60 },
} as const;

export type SlaKey = keyof typeof slaMinutes;

/** Cor neutra para tempo sem amostra — não é "dentro da meta". */
export const noSampleStyle = { bg: chartColors.track, fg: chartColors.axis } as const;

/** `null` (sem amostra) não tem status: devolve `null`, não 'good'. */
export function statusFor(key: SlaKey, minutes: number | null | undefined): Status | null {
  if (minutes == null) return null;
  const t = slaMinutes[key];
  if (minutes <= t.good) return 'good';
  if (minutes <= t.warn) return 'warn';
  return 'bad';
}

/** 17 → "17 min" · 590 → "9h50" · null → "—" */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes == null) return '—';
  const m = Math.round(minutes);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h${String(rest).padStart(2, '0')}` : `${h}h`;
}

export const pct = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 100) : 0;

export const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
