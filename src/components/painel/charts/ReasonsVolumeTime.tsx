import { ChartCard, EmptyChart } from './ChartCard';
import { chartColors, formatMinutes, slaMinutes } from './theme';
import type { ReasonStat } from './types';

/** Volume e tempo em duas colunas alinhadas, sem eixo duplo. */
export function ReasonsVolumeTime({ data }: { data: ReasonStat[] }) {
  const rows = [...data].sort((a, b) => b.count - a.count);
  const maxV = Math.max(...rows.map((r) => r.count), 1);
  const maxT = Math.max(...rows.map((r) => r.medianFirstResponseMin ?? 0), 1);
  const slowest = rows.reduce<ReasonStat | undefined>((w, r) => {
    if (r.medianFirstResponseMin == null) return w;
    if (!w || w.medianFirstResponseMin == null) return r;
    return r.medianFirstResponseMin > w.medianFirstResponseMin ? r : w;
  }, undefined);

  if (!rows.length) {
    return (
      <ChartCard title="Por motivo">
        <EmptyChart message="Nenhum motivo registrado no período." />
      </ChartCard>
    );
  }

  return (
    <ChartCard title="Por motivo" subtitle="Volume e mediana de 1ª resposta, lado a lado">
      <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <span />
        <span className="text-xs text-muted-foreground">Volume</span>
        <span className="text-xs text-muted-foreground">Mediana 1ª resposta</span>
        {rows.map((r) => {
          const median = r.medianFirstResponseMin;
          const slow =
            r === slowest && median != null && median > slaMinutes.firstResponse.good * 0.5;
          const tFill = slow ? chartColors.status.warn.fill : chartColors.muted;
          return [
            <span key={`${r.reason}-n`} className="truncate py-2 font-semibold" title={r.reason}>{r.reason}</span>,
            <div key={`${r.reason}-v`} className="flex items-center gap-2">
              <div className="h-3 flex-1 rounded-full bg-secondary">
                <div className="h-3 rounded-full bg-primary" style={{ width: `${(r.count / maxV) * 100}%` }} />
              </div>
              <span className="w-7 text-right text-[13px] font-semibold tabular-nums">{r.count}</span>
            </div>,
            <div key={`${r.reason}-t`} className="flex items-center gap-2">
              <div className="h-3 flex-1 rounded-full bg-secondary">
                <div className="h-3 rounded-full" style={{ width: `${((median ?? 0) / maxT) * 100}%`, background: tFill }} />
              </div>
              <span className="w-14 text-right text-[13px] font-semibold tabular-nums"
                style={{
                  color: median == null
                    ? chartColors.axis
                    : slow
                      ? chartColors.status.warn.fg
                      : chartColors.text,
                }}>
                {formatMinutes(median)}
              </span>
            </div>,
          ];
        })}
      </div>
    </ChartCard>
  );
}
