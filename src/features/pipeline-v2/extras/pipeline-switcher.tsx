"use client";

/*
 * Seletor de pipeline — usa o mesmo DropdownGlass do FilterBar do dashboard
 * para manter visual consistente em toda a V2.
 *
 * Duas variantes:
 *  - `dropdown` (default): gatilho padrão com nome do funil (Settings, Lista).
 *  - `icon`: chevron compacto para plugar ao lado do título (Kanban).
 *
 * Envolto em <ClientOnly> porque o `DropdownMenu` do Radix usa `useId()`
 * internamente e a contagem de chamadas estava divergindo entre SSR e CSR.
 */

import { IconChevronDown, IconFilter } from "@tabler/icons-react";

import { DropdownGlass } from "@/components/crm/dropdown-glass";
import { ClientOnly } from "@/components/util/client-only";
import { usePipelines } from "@/features/pipeline-v2/hooks";
import { CountUpNumber } from "@/components/crm/count-up";

function pipelineDealTotal(
  stages: { dealCount?: number }[] | undefined,
): number {
  if (!stages?.length) return 0;
  return stages.reduce((acc, s) => acc + (s.dealCount ?? 0), 0);
}

interface PipelineSwitcherProps {
  selectedId: string | null;
  onChange: (id: string) => void;
  variant?: "dropdown" | "icon";
}

export function PipelineSwitcher({ selectedId, onChange, variant = "dropdown" }: PipelineSwitcherProps) {
  const { data: pipelines = [], isLoading } = usePipelines();

  const options = pipelines.map((p) => {
    const total = pipelineDealTotal(p.stages);
    return {
      value: p.id,
      label: p.name,
      searchText: p.name,
      icon: <IconFilter size={15} />,
      trailing: (
        <CountUpNumber
          value={total}
          fromZero
          className="shrink-0 font-display text-[11px] font-bold tabular-nums text-[var(--text-muted)]"
        />
      ),
    };
  });

  if (variant === "icon") {
    const current = pipelines.find((p) => p.id === selectedId);
    return (
      <ClientOnly
        fallback={
          <div
            aria-hidden
            data-tour="pipeline-switcher"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)]"
          />
        }
      >
        <DropdownGlass
          options={options}
          value={selectedId ?? undefined}
          onValueChange={onChange}
          menuLabel="Trocar de funil"
          align="start"
          // Trigger ícone tem 32px — com matchTriggerWidth o menu inteiro
          // ficava espremido numa faixa de 32px (bug visual). E enquanto a
          // query de funis não resolve, options=[] → "Nenhum resultado";
          // disabled evita abrir o menu vazio nesse intervalo.
          matchTriggerWidth={false}
          className="min-w-[220px]"
          disabled={isLoading}
          trigger={
            <button
              type="button"
              data-tour="pipeline-switcher"
              aria-label={current ? `Funil: ${current.name}` : "Selecionar funil"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] text-[var(--text-muted)] shadow-[var(--glass-shadow-sm)] transition-colors hover:border-[var(--brand-primary)] hover:bg-[var(--color-primary-soft)] hover:text-[var(--brand-primary)] data-[state=open]:border-[var(--brand-primary)] data-[state=open]:bg-[var(--brand-primary)] data-[state=open]:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <IconChevronDown size={16} stroke={2.4} />
            </button>
          }
        />
      </ClientOnly>
    );
  }

  return (
    <ClientOnly
      fallback={
        <div
          aria-hidden
          className="inline-flex h-10 min-w-[180px] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--glass-border)] bg-[var(--glass-bg-overlay)] px-3.5 shadow-[var(--glass-shadow-sm)]"
        >
          <span className="font-display text-[13px] font-semibold text-[var(--text-muted)]">
            Pipeline
          </span>
        </div>
      }
    >
      <DropdownGlass
        options={options}
        value={selectedId ?? undefined}
        onValueChange={onChange}
        placeholder="Pipeline"
        menuLabel="Pipeline"
        triggerClassName="min-w-[180px]"
        disabled={isLoading}
      />
    </ClientOnly>
  );
}
