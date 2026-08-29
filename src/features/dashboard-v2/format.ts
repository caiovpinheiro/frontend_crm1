export function formatCurrency(value: number): string {
  if (Math.abs(value) >= 1000) {
    return `R$ ${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  }
  return `R$ ${value.toLocaleString("pt-BR")}`;
}

export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h < 48) return m > 0 ? `${h}h ${m}min` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh > 0 ? `${d}d ${rh}h` : `${d}d`;
}

/** Duração no estilo Kommo: `15 h. 20 m.` */
export function formatUsageHours(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.round((safe % 3600) / 60);
  if (h <= 0) return `${m} m.`;
  return `${h} h. ${m} m.`;
}

export function formatPct(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

/** Busca client-side do dashboard (a API não aceita `q`). */
export function textMatchesQuery(
  text: string | null | undefined,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (text ?? "").toLowerCase().includes(q);
}
