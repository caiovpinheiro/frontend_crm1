export const DASHBOARD_CHART_TYPES = [
  "bar",
  "column",
  "donut",
  "radial",
  "dot",
  "treemap",
] as const;

export type DashboardChartType = (typeof DASHBOARD_CHART_TYPES)[number];

export const DEFAULT_CARD_CHART_TYPE: DashboardChartType = "column";
export const DEFAULT_USAGE_CHART_TYPE: DashboardChartType = "treemap";

export const DASHBOARD_CHART_TYPE_LABELS: Record<DashboardChartType, string> = {
  bar: "Barras",
  column: "Colunas",
  donut: "Rosca",
  radial: "Radial",
  dot: "Dot plot",
  treemap: "Treemap",
};

export function isDashboardChartType(value: unknown): value is DashboardChartType {
  return (
    typeof value === "string" &&
    (DASHBOARD_CHART_TYPES as readonly string[]).includes(value)
  );
}

export function resolveChartType(
  value: unknown,
  fallback: DashboardChartType = DEFAULT_CARD_CHART_TYPE,
): DashboardChartType {
  return isDashboardChartType(value) ? value : fallback;
}

export const CATEGORICAL_CHART_COLORS = [
  "var(--brand-primary)",
  "var(--brand-secondary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-info)",
  "var(--color-teal)",
  "var(--brand-primary-dark)",
  "var(--color-lead)",
] as const;

export function categoricalColor(index: number): string {
  return CATEGORICAL_CHART_COLORS[index % CATEGORICAL_CHART_COLORS.length]!;
}
