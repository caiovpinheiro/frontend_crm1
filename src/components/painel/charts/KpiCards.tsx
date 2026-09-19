import { CARD_SURFACE_CLASS } from '@/components/crm/sortable-header';

import { chartColors, type Status } from './theme';

export type Kpi = { label: string; value: string; hint?: string; status?: Status };

export function KpiCards({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {items.map((k) => {
        // Só fora da meta muda a cor do card; 'good' fica neutro.
        const s = k.status && k.status !== 'good' ? chartColors.status[k.status] : null;
        return (
          <div
            key={k.label}
            className={`${CARD_SURFACE_CLASS} flex flex-col gap-1.5 px-6 py-5`}
            style={s ? { borderColor: s.bg } : undefined}
          >
            <span className="text-[13px] text-muted-foreground" style={s ? { color: s.fg } : undefined}>
              {k.label}
            </span>
            <span
              className="text-4xl font-bold tracking-tight text-foreground tabular-nums"
              style={s ? { color: s.fg } : undefined}
            >
              {k.value}
            </span>
            {k.hint && <span className="text-[13px] text-muted-foreground">{k.hint}</span>}
          </div>
        );
      })}
    </div>
  );
}
