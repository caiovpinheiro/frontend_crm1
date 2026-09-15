"use client";

import * as React from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type DateRange = {
  from: Date | null;
  to: Date | null;
};

type DateRangePickerProps = {
  value: DateRange;
  onChange: (range: DateRange) => void;
  placeholder?: string;
  className?: string;
};

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

type Preset = { label: string; getRange: () => DateRange };

const PRESETS: Preset[] = [
  {
    label: "Hoje",
    getRange: () => {
      const t = startOfDay(new Date());
      return { from: t, to: t };
    },
  },
  {
    label: "Ontem",
    getRange: () => {
      const y = startOfDay(subDays(new Date(), 1));
      return { from: y, to: y };
    },
  },
  {
    label: "Últimos 7 dias",
    getRange: () => ({ from: startOfDay(subDays(new Date(), 6)), to: startOfDay(new Date()) }),
  },
  {
    label: "Últimos 30 dias",
    getRange: () => ({ from: startOfDay(subDays(new Date(), 29)), to: startOfDay(new Date()) }),
  },
  {
    label: "Este mês",
    getRange: () => ({ from: startOfMonth(new Date()), to: startOfDay(new Date()) }),
  },
  {
    label: "Mês passado",
    getRange: () => {
      const ref = subMonths(new Date(), 1);
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    },
  },
];

function formatTrigger(range: DateRange): string | null {
  if (range.from && range.to) {
    if (isSameDay(range.from, range.to)) {
      return format(range.from, "dd MMM yyyy", { locale: ptBR });
    }
    return `${format(range.from, "dd MMM", { locale: ptBR })} — ${format(range.to, "dd MMM yyyy", { locale: ptBR })}`;
  }
  if (range.from) {
    return `${format(range.from, "dd MMM yyyy", { locale: ptBR })} — ...`;
  }
  return null;
}

export function DateRangePicker({
  value,
  onChange,
  placeholder = "Período",
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const [leftMonth, setLeftMonth] = React.useState<Date>(
    value.from ?? subMonths(new Date(), 1),
  );
  // Estado de seleção em andamento: primeiro clique define o início.
  const [pendingFrom, setPendingFrom] = React.useState<Date | null>(null);
  const [hovered, setHovered] = React.useState<Date | null>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingFrom(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  React.useEffect(() => {
    if (open && value.from) setLeftMonth(value.from);
  }, [open, value.from]);

  const triggerLabel = formatTrigger(value);
  const hasValue = Boolean(value.from);

  function handleDayClick(day: Date) {
    if (!pendingFrom) {
      setPendingFrom(day);
      onChange({ from: day, to: null });
      return;
    }
    // Segundo clique: fecha o intervalo (ordena se necessário).
    const from = isBefore(day, pendingFrom) ? day : pendingFrom;
    const to = isBefore(day, pendingFrom) ? pendingFrom : day;
    onChange({ from, to });
    setPendingFrom(null);
    setHovered(null);
    setOpen(false);
  }

  // Intervalo efetivo para destaque (inclui hover durante seleção).
  const activeFrom = pendingFrom ?? value.from;
  const activeTo = pendingFrom ? hovered : value.to;

  function isInRange(day: Date): boolean {
    if (!activeFrom || !activeTo) return false;
    const start = isBefore(activeFrom, activeTo) ? activeFrom : activeTo;
    const end = isBefore(activeFrom, activeTo) ? activeTo : activeFrom;
    return isWithinInterval(day, { start: startOfDay(start), end: startOfDay(end) });
  }

  function renderMonth(monthDate: Date) {
    const monthStart = startOfMonth(monthDate);
    const calStart = startOfWeek(monthStart, { locale: ptBR });
    const calEnd = endOfWeek(endOfMonth(monthDate), { locale: ptBR });
    const days = eachDayOfInterval({ start: calStart, end: calEnd });

    return (
      <div className="flex-1">
        <div className="mb-2 grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS.map((w, i) => (
            <span
              key={`${w}-${i}`}
              className="font-display text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]"
            >
              {w}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day) => {
            const inMonth = isSameMonth(day, monthDate);
            const isFrom = activeFrom ? isSameDay(day, activeFrom) : false;
            const isTo = activeTo ? isSameDay(day, activeTo) : false;
            const isEndpoint = isFrom || isTo;
            const inRange = isInRange(day) && !isEndpoint;
            const isToday = isSameDay(day, new Date());

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => handleDayClick(day)}
                onMouseEnter={() => pendingFrom && setHovered(day)}
                className={cn(
                  "relative flex h-9 items-center justify-center font-display text-[13px] font-semibold transition-all duration-200",
                  // Cantos arredondados nas extremidades do intervalo.
                  inRange && "bg-primary/10 text-primary rounded-none",
                  isFrom && "rounded-l-lg",
                  isTo && "rounded-r-lg",
                  isEndpoint &&
                    "z-10 rounded-lg bg-primary text-primary-foreground shadow-md",
                  !isEndpoint && !inRange && inMonth &&
                    "rounded-lg text-foreground hover:bg-secondary hover:shadow-sm",
                  !inMonth && !isEndpoint && !inRange &&
                    "rounded-lg text-muted-foreground/40 hover:bg-secondary hover:shadow-sm",
                )}
              >
                {format(day, "d")}
                {isToday && !isEndpoint && (
                  <span className="absolute bottom-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn("relative w-full min-w-0", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border px-3 font-display text-[12.5px] font-semibold backdrop-blur-md transition-colors",
          hasValue
            ? "border-[var(--brand-primary)]/40 bg-[var(--color-enterprise-bg)] text-[var(--brand-primary)]"
            : "border-[var(--glass-border)] bg-[var(--glass-bg-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
        )}
      >
        <IconCalendar size={16} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{triggerLabel ?? placeholder}</span>
        {hasValue && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Limpar período"
            onClick={(e) => {
              e.stopPropagation();
              onChange({ from: null, to: null });
              setPendingFrom(null);
            }}
            className="ml-1 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-primary transition-all duration-200 hover:bg-primary/15 hover:shadow-sm"
          >
            <IconX size={13} />
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-auto top-[calc(100%+8px)] z-50 flex max-w-[min(100vw-1.5rem,34rem)] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--glass-border)] bg-[var(--glass-bg-modal)] shadow-[var(--glass-shadow-lg)] backdrop-blur-xl sm:flex-row">
          {/* Presets — horizontal scroll on mobile; left column from sm+ */}
          <div className="flex gap-0.5 overflow-x-auto border-b border-[var(--glass-border-subtle)] p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-[150px] sm:shrink-0 sm:flex-col sm:overflow-visible sm:border-b-0 sm:border-r">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => {
                  const range = preset.getRange();
                  onChange(range);
                  if (range.from) setLeftMonth(range.from);
                  setPendingFrom(null);
                  setOpen(false);
                }}
                className="shrink-0 rounded-lg px-3 py-2 text-left font-display text-[13px] font-semibold text-foreground transition-all duration-200 hover:bg-secondary hover:text-primary hover:shadow-sm"
              >
                {preset.label}
              </button>
            ))}
          </div>

          {/* Calendários */}
          <div className="min-w-0 p-3">
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => setLeftMonth((m) => subMonths(m, 1))}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-primary hover:shadow-sm"
              >
                <IconChevronLeft size={20} />
              </button>
              <div className="flex min-w-0 flex-1 items-center justify-around gap-6">
                <span className="font-display text-[13px] font-bold capitalize text-[var(--text-primary)]">
                  {format(leftMonth, "MMMM yyyy", { locale: ptBR })}
                </span>
                <span className="hidden font-display text-[13px] font-bold capitalize text-[var(--text-primary)] sm:inline">
                  {format(addMonths(leftMonth, 1), "MMMM yyyy", { locale: ptBR })}
                </span>
              </div>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() => setLeftMonth((m) => addMonths(m, 1))}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-secondary hover:text-primary hover:shadow-sm"
              >
                <IconChevronRight size={20} />
              </button>
            </div>
            <div className="flex gap-5">
              <div className="w-full min-w-0 sm:w-[224px]">{renderMonth(leftMonth)}</div>
              <div className="hidden w-[224px] sm:block">
                {renderMonth(addMonths(leftMonth, 1))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
