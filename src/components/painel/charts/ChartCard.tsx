import type { ReactNode } from 'react';

import { CARD_SURFACE_CLASS } from '@/components/crm/sortable-header';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** Casca padrão dos cards — superfície canônica de conteúdo do DS. */
export function ChartCard({ title, subtitle, actions, footer, className = '', children }: Props) {
  return (
    <section
      className={`${CARD_SURFACE_CLASS} flex flex-col gap-4 p-6 ${className}`}
      aria-label={title}
    >
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[17px] font-semibold text-foreground">{title}</h2>
          {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
      {footer && <footer className="text-xs text-muted-foreground">{footer}</footer>}
    </section>
  );
}

/** "Sem dado no período" dentro do próprio card, no lugar do gráfico. */
export function EmptyChart({
  message = 'Nenhum dado no período selecionado.',
}: {
  message?: string;
}) {
  return <p className="py-16 text-center text-sm text-muted-foreground">{message}</p>;
}

export function LegendDot({ color, label, round = false }: { color: string; label: string; round?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={round ? 'size-2.5 rounded-full' : 'size-2.5 rounded-sm'}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
