"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isValid, parseISO, startOfMonth, startOfWeek, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconCalendar as CalendarDays, IconChevronLeft as ChevronLeft, IconChevronRight as ChevronRight } from "@tabler/icons-react";

import { cn } from "@/lib/utils";
import { FILTER_FIELD_TRIGGER_CLASS } from "@/components/crm/dropdown-glass";
import { useModalPortalContainer } from "@/components/ui/modal-portal-context";

/** Clique no calendário portado não deve fechar o Período (outro portal). */
export const DATE_PICKER_PORTAL_SELECTOR = "[data-date-picker-portal]";

type DatePickerProps = {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Classes extras no botão gatilho (borda, altura, radius…). */
  triggerClassName?: string;
  /**
   * `soft`: popover `rounded-2xl` e dias `rounded-full` (modal GCal).
   * Default mantém o chrome dos filtros de período.
   */
  shape?: "default" | "soft";
  disabled?: boolean;
};

function parseValue(value?: string | null) {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "Selecionar data",
  className,
  triggerClassName,
  shape = "default",
  disabled,
}: DatePickerProps) {
  const soft = shape === "soft";
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const portalContainer = useModalPortalContainer();
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null);
  const selectedDate = React.useMemo(() => parseValue(value), [value]);
  const [visibleMonth, setVisibleMonth] = React.useState<Date>(selectedDate ?? new Date());

  // Sync visibleMonth only when the string value changes — using `value` (string)
  // avoids the bug where parseISO creates a new Date reference on every render,
  // which caused the useEffect to fire on every render and reset visibleMonth,
  // making the prev/next navigation buttons appear to do nothing.
  React.useEffect(() => {
    const parsed = parseValue(value);
    if (parsed) setVisibleMonth(parsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const updateCoords = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    const panel = panelRef.current;
    const ch = panel?.offsetHeight ?? 0;
    const cw = panel?.offsetWidth ?? 280;
    const margin = 8;
    const vh = window.innerHeight;
    const vw = document.documentElement.clientWidth;
    const spaceBelow = vh - r.bottom;
    const openUp = ch > 0 && spaceBelow < ch + margin && r.top > spaceBelow;
    const top = openUp
      ? Math.max(margin, r.top - ch - margin)
      : Math.min(r.bottom + margin, Math.max(margin, vh - Math.max(ch, 1) - margin));
    // Prefer `align="start"`; near the right edge flip to `align="end"` (PageActionsMenu).
    let left = r.left;
    if (left + cw + margin > vw) {
      left = r.right - cw;
    }
    left = Math.min(Math.max(margin, left), Math.max(margin, vw - cw - margin));
    setCoords((prev) =>
      prev && prev.top === top && prev.left === left ? prev : { top, left },
    );
  }, []);

  React.useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    const raf = requestAnimationFrame(updateCoords);
    const panel = panelRef.current;
    const ro = panel ? new ResizeObserver(updateCoords) : null;
    if (panel && ro) ro.observe(panel);
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [open, updateCoords]);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const t = event.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.stopImmediatePropagation();
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const monthStart = startOfMonth(visibleMonth);
  const calendarStart = startOfWeek(monthStart, { locale: ptBR });
  const calendarEnd = endOfWeek(endOfMonth(visibleMonth), { locale: ptBR });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const portalRoot = portalContainer ?? (typeof document !== "undefined" ? document.body : null);

  return (
    <div className={cn("relative min-w-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          FILTER_FIELD_TRIGGER_CLASS,
          "justify-between text-left",
          selectedDate && "text-[var(--text-primary)]",
          disabled && "cursor-not-allowed opacity-60",
          triggerClassName,
        )}
      >
        <span className={cn("truncate", !selectedDate && "text-[var(--text-muted)]")}>
          {selectedDate ? format(selectedDate, "dd/MM/yyyy") : placeholder}
        </span>
        <CalendarDays className="size-3.5 shrink-0 text-current opacity-60" />
      </button>

      {open && portalRoot
        ? createPortal(
            <div
              ref={panelRef}
              data-date-picker-portal=""
              role="dialog"
              aria-label="Calendário"
              style={{
                position: "fixed",
                top: coords?.top ?? 0,
                left: coords?.left ?? 0,
                visibility: coords ? "visible" : "hidden",
              }}
              className={cn(
                "z-(--z-radix) w-[17.5rem] overflow-visible border border-border bg-[var(--dropdown-solid-bg)] p-3 text-foreground shadow-lg",
                soft ? "rounded-2xl p-4" : "rounded-xl",
              )}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => subMonths(current, 1))}
                  className={cn(
                    "inline-flex size-8 items-center justify-center text-muted-foreground transition hover:bg-primary/10 hover:text-primary",
                    soft ? "rounded-full" : "rounded-lg",
                  )}
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <div className="font-display text-sm font-semibold capitalize text-foreground">
                  {format(visibleMonth, "MMMM yyyy", { locale: ptBR })}
                </div>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
                  className={cn(
                    "inline-flex size-8 items-center justify-center text-muted-foreground transition hover:bg-primary/10 hover:text-primary",
                    soft ? "rounded-full" : "rounded-lg",
                  )}
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>

              <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => (
                  <span key={`${day}-${index}`}>{day}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const isSelected = selectedDate ? isSameDay(day, selectedDate) : false;
                  const inMonth = isSameMonth(day, visibleMonth);

                  return (
                    <button
                      key={day.toISOString()}
                      type="button"
                      onClick={() => {
                        onChange(format(day, "yyyy-MM-dd"));
                        setOpen(false);
                      }}
                      className={cn(
                        "flex size-8 items-center justify-center text-xs font-medium transition",
                        soft ? "rounded-full" : "rounded-lg",
                        isSelected && "bg-primary text-primary-foreground shadow-sm",
                        !isSelected && inMonth && "text-foreground hover:bg-primary/10 hover:text-primary",
                        !inMonth && "text-muted-foreground opacity-40 hover:bg-primary/10",
                      )}
                    >
                      {format(day, "d")}
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    onChange(format(today, "yyyy-MM-dd"));
                    setVisibleMonth(today);
                    setOpen(false);
                  }}
                  className="text-xs font-medium text-foreground transition hover:text-primary"
                >
                  Hoje
                </button>
              </div>
            </div>,
            portalRoot,
          )
        : null}
    </div>
  );
}
