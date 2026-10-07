import type { ReactNode } from "react";

export type StatItem = { label: string; value: ReactNode; hint?: string };

/** Totais do card em linha (Total / Média / Usuários ativos...). */
export function StatList({ items, ariaLabel }: { items: StatItem[]; ariaLabel?: string }) {
  return (
    <dl aria-label={ariaLabel} className="mb-3.5 flex flex-wrap gap-x-7 gap-y-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-[11px] font-medium text-muted-foreground">{item.label}</dt>
          <dd className="m-0 truncate text-xl font-bold tracking-tight text-foreground tabular-nums">
            {item.value}
            {item.hint ? (
              <small className="block text-[11px] font-normal tracking-normal text-muted-foreground">
                {item.hint}
              </small>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}
