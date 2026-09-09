"use client";

import { useEffect, useId, useMemo, useState } from "react";
import {
  IconCalendarEvent,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconClockHour4,
  IconGripHorizontal,
  IconX,
} from "@tabler/icons-react";
import { useRouter } from "next/navigation";

import { ChatAvatar } from "@/components/inbox/chat-avatar";
import type { ActivityAlertDto } from "@/features/directory-v2/api";
import { ACTIVITY_KINDS, type ActivityKind } from "@/lib/activities-data";
import { AVATAR_SIZE } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export type ActivityReminderAction =
  | { type: "complete" }
  | { type: "reschedule"; scheduledAt: string }
  | { type: "dismiss" };

type View = "home" | "reschedule" | "done-complete" | "done-reschedule";

const TYPE_TO_KIND: Record<string, ActivityKind> = {
  CALL: "ligacao",
  MEETING: "reuniao",
  EMAIL: "email",
  TASK: "tarefa",
  OTHER: "evento",
};

const WEEKDAYS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;
const TIME_SLOTS = buildTimeSlots(8, 20, 30);

function buildTimeSlots(fromHour: number, toHour: number, stepMin: number) {
  const out: string[] = [];
  for (let m = fromHour * 60; m <= toHour * 60; m += stepMin) {
    const hh = String(Math.floor(m / 60)).padStart(2, "0");
    const mm = String(m % 60).padStart(2, "0");
    out.push(`${hh}:${mm}`);
  }
  return out;
}

function alertHeadline(alert: ActivityAlertDto): string {
  if (alert.kind === "PRE_DUE") return "Tarefa em 15 minutos";
  const due = new Date(alert.scheduledAt);
  if (!Number.isNaN(due.getTime()) && due.getTime() < Date.now()) {
    return "Tarefa vencida";
  }
  return "Tarefa no horário";
}

function typeLabel(type: string): string {
  const kind = TYPE_TO_KIND[type];
  if (kind) return ACTIVITY_KINDS[kind].label;
  return type;
}

function formatScheduledAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatConfirmWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return `${date} às ${time}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function toDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineLocal(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time}:00`);
}

function addMinutes(from: Date, minutes: number) {
  return new Date(from.getTime() + minutes * 60_000);
}

function tomorrowAtNine() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

function monthGrid(cursor: Date) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells: Array<{ date: Date; inMonth: boolean } | null> = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(cursor.getFullYear(), cursor.getMonth(), day),
      inMonth: true,
    });
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type ActivityReminderCardProps = {
  alert: ActivityAlertDto;
  busy?: boolean;
  onAction: (action: ActivityReminderAction) => Promise<void>;
  onFinished: () => void;
};

export function ActivityReminderCard({
  alert,
  busy = false,
  onAction,
  onFinished,
}: ActivityReminderCardProps) {
  const router = useRouter();
  const titleId = useId();
  const [view, setView] = useState<View>("home");
  const [confirmWhen, setConfirmWhen] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const locked = busy || pending;

  const headline = useMemo(() => alertHeadline(alert), [alert]);
  const KindIcon = ACTIVITY_KINDS[TYPE_TO_KIND[alert.type] ?? "tarefa"].icon;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || locked) return;
      if (view === "reschedule") {
        setView("home");
        return;
      }
      void run({ type: "dismiss" });
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [locked, view]); // eslint-disable-line react-hooks/exhaustive-deps -- run fecha via dismiss

  async function run(action: ActivityReminderAction, after?: View, whenLabel?: string) {
    if (locked) return;
    setPending(true);
    try {
      await onAction(action);
      if (after) {
        if (whenLabel) setConfirmWhen(whenLabel);
        setView(after);
        window.setTimeout(() => onFinished(), 1100);
      } else {
        onFinished();
      }
    } finally {
      setPending(false);
    }
  }

  const contact = alert.contact;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-(--z-above)",
        "inset-x-3 top-[calc(env(safe-area-inset-top,0px)+0.75rem)] flex justify-center",
        "md:inset-x-auto md:bottom-6 md:right-6 md:top-auto md:justify-end",
      )}
      aria-live="polite"
    >
      <div
        role="dialog"
        aria-labelledby={titleId}
        aria-busy={locked || undefined}
        className={cn(
          "pointer-events-auto relative w-full max-w-[380px] overflow-hidden md:w-[380px]",
          "rounded-[var(--inbox-radius)] border border-[var(--glass-border)]",
          "bg-[var(--glass-bg-modal)]/95 shadow-[var(--glass-shadow-lg)] backdrop-blur-xl",
          "text-[var(--inbox-text)]",
          "animate-in fade-in-0 slide-in-from-bottom-3 duration-300",
          "motion-reduce:animate-none motion-reduce:transition-none",
          locked && "opacity-80",
        )}
      >
        <div className="flex items-center justify-center pt-2" aria-hidden>
          <IconGripHorizontal
            size={18}
            className="text-[var(--inbox-text-muted)]/50"
          />
        </div>

        <button
          type="button"
          disabled={locked}
          aria-label="Fechar lembrete"
          onClick={() => void run({ type: "dismiss" })}
          className={cn(
            "absolute right-2 top-2 rounded-full p-1.5 text-[var(--inbox-text-muted)]",
            "outline-none transition-colors hover:bg-[var(--glass-bg-strong)] hover:text-[var(--inbox-text)]",
            "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          <IconX className="size-4" strokeWidth={2.2} />
        </button>

        <div className="relative min-h-[220px] overflow-hidden">
          <div
            className={cn(
              "flex w-[200%] transition-transform duration-300 ease-out motion-reduce:transition-none",
              view === "reschedule" ? "-translate-x-1/2" : "translate-x-0",
              (view === "done-complete" || view === "done-reschedule") && "opacity-0",
            )}
          >
            <HomePane
              alert={alert}
              headline={headline}
              titleId={titleId}
              KindIcon={KindIcon}
              contact={contact}
              locked={locked}
              onOpenContact={() => {
                if (contact?.id) router.push(`/contacts/${contact.id}`);
              }}
              onComplete={() => void run({ type: "complete" }, "done-complete")}
              onReschedule={() => setView("reschedule")}
            />
            <ReschedulePane
              locked={locked}
              onBack={() => setView("home")}
              onSave={(when) =>
                void run(
                  { type: "reschedule", scheduledAt: when.toISOString() },
                  "done-reschedule",
                  formatConfirmWhen(when.toISOString()),
                )
              }
            />
          </div>

          {(view === "done-complete" || view === "done-reschedule") && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center animate-in fade-in-0 zoom-in-95 duration-300">
              <span className="flex size-12 items-center justify-center rounded-full bg-[var(--inbox-sla-ok)]/15 text-[var(--inbox-sla-ok)]">
                <IconCheck size={26} stroke={2.4} aria-hidden />
              </span>
              <p className="font-display text-[15px] font-semibold text-[var(--inbox-text)]">
                {view === "done-complete"
                  ? "Atividade concluída"
                  : `Remarcado para ${confirmWhen ?? ""}`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HomePane({
  alert,
  headline,
  titleId,
  KindIcon,
  contact,
  locked,
  onOpenContact,
  onComplete,
  onReschedule,
}: {
  alert: ActivityAlertDto;
  headline: string;
  titleId: string;
  KindIcon: (typeof ACTIVITY_KINDS)[ActivityKind]["icon"];
  contact: ActivityAlertDto["contact"];
  locked: boolean;
  onOpenContact: () => void;
  onComplete: () => void;
  onReschedule: () => void;
}) {
  return (
    <div className="w-1/2 shrink-0 px-4 pb-4 pt-1">
      <div className="flex items-start gap-3 pr-8">
        <div
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
            alert.kind === "PRE_DUE"
              ? "bg-[color-mix(in_srgb,var(--inbox-brand)_16%,transparent)] text-[var(--inbox-brand)]"
              : "bg-[color-mix(in_srgb,var(--inbox-sla-warn)_18%,transparent)] text-[var(--inbox-sla-warn)]",
          )}
          aria-hidden
        >
          <IconClockHour4 className="size-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[11px] font-bold uppercase tracking-wide text-[var(--inbox-text-muted)]">
            {headline}
          </p>
          <p
            id={titleId}
            className="mt-0.5 font-display text-[15px] font-semibold leading-snug text-[var(--inbox-text)]"
          >
            {alert.title}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 rounded-xl px-1 py-1 text-[13px] text-[var(--inbox-text)]">
          <KindIcon size={16} className="shrink-0 text-[var(--inbox-text-muted)]" aria-hidden />
          <span>
            {formatScheduledAt(alert.scheduledAt)}
            <span className="text-[var(--inbox-text-muted)]"> · </span>
            {typeLabel(alert.type)}
          </span>
        </div>
        {contact ? (
          <button
            type="button"
            onClick={onOpenContact}
            className="flex items-center gap-2 rounded-xl px-1 py-1 text-left outline-none transition-colors hover:bg-[var(--glass-bg-strong)] focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]"
          >
            <ChatAvatar
              user={{ id: contact.id, name: contact.name }}
              size={AVATAR_SIZE.xs}
            />
            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--inbox-text)]">
              {contact.name}
            </span>
          </button>
        ) : alert.deal?.title ? (
          <p className="px-1 text-[13px] text-[var(--inbox-text-muted)]">{alert.deal.title}</p>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={locked}
          onClick={onReschedule}
          className={cn(
            "inline-flex h-9 items-center rounded-full border border-[var(--inbox-border)]",
            "bg-[var(--glass-bg-strong)] px-3.5 font-display text-[13px] font-semibold",
            "text-[var(--inbox-text)] outline-none transition-colors",
            "hover:bg-[var(--glass-bg-overlay)]",
            "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          Remarcar
        </button>
        <button
          type="button"
          disabled={locked}
          onClick={onComplete}
          className={cn(
            "inline-flex h-9 items-center rounded-full bg-[var(--inbox-brand)] px-4",
            "font-display text-[13px] font-semibold text-[var(--color-primary-foreground)]",
            "outline-none transition-transform hover:brightness-105 active:scale-[0.98]",
            "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
            "disabled:pointer-events-none disabled:opacity-50",
          )}
        >
          Concluída
        </button>
      </div>
    </div>
  );
}

function ReschedulePane({
  locked,
  onBack,
  onSave,
}: {
  locked: boolean;
  onBack: () => void;
  onSave: (when: Date) => void;
}) {
  const now = new Date();
  const today = startOfDay(now);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [dateKey, setDateKey] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);

  const selected = dateKey && time ? combineLocal(dateKey, time) : null;
  const canSave = Boolean(selected && selected.getTime() > Date.now());

  const chips: Array<{ label: string; when: Date }> = [
    { label: "10 min", when: addMinutes(now, 10) },
    { label: "30 min", when: addMinutes(now, 30) },
    { label: "1h", when: addMinutes(now, 60) },
    { label: "Amanhã 09:00", when: tomorrowAtNine() },
  ];

  function applyWhen(when: Date) {
    setDateKey(toDateKey(when));
    setTime(
      `${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`,
    );
    setCursor(new Date(when.getFullYear(), when.getMonth(), 1));
  }

  const cells = monthGrid(cursor);
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div className="flex w-1/2 shrink-0 flex-col px-4 pb-4 pt-1">
      <div className="mb-2 flex items-center gap-1">
        <button
          type="button"
          onClick={onBack}
          disabled={locked}
          className="rounded-full p-1.5 text-[var(--inbox-text-muted)] outline-none hover:bg-[var(--glass-bg-strong)] hover:text-[var(--inbox-text)] focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]"
          aria-label="Voltar ao lembrete"
        >
          <IconChevronLeft size={18} />
        </button>
        <p className="font-display text-[13px] font-semibold text-[var(--inbox-text)]">
          Remarcar
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const active =
            dateKey === toDateKey(chip.when) &&
            time ===
              `${String(chip.when.getHours()).padStart(2, "0")}:${String(chip.when.getMinutes()).padStart(2, "0")}`;
          return (
            <button
              key={chip.label}
              type="button"
              disabled={locked}
              onClick={() => applyWhen(chip.when)}
              className={cn(
                "rounded-full border px-2.5 py-1 font-display text-[11px] font-semibold outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
                active
                  ? "border-[var(--inbox-brand)] bg-[var(--inbox-brand)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--inbox-border)] bg-[var(--glass-bg-strong)] text-[var(--inbox-text)] hover:bg-[var(--glass-bg-overlay)]",
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="Mês anterior"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
          }
          className="rounded-full p-1 text-[var(--inbox-text-muted)] outline-none hover:bg-[var(--glass-bg-strong)] focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]"
        >
          <IconChevronLeft size={16} />
        </button>
        <p className="font-display text-[12px] font-semibold capitalize text-[var(--inbox-text)]">
          {monthLabel}
        </p>
        <button
          type="button"
          aria-label="Próximo mês"
          onClick={() =>
            setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
          }
          className="rounded-full p-1 text-[var(--inbox-text-muted)] outline-none hover:bg-[var(--glass-bg-strong)] focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]"
        >
          <IconChevronRight size={16} />
        </button>
      </div>

      <div className="mb-2 grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="py-0.5 text-[10px] font-bold uppercase text-[var(--inbox-text-muted)]"
          >
            {d}
          </span>
        ))}
        {cells.map((cell, i) => {
          if (!cell) {
            return <span key={`empty-${i}`} />;
          }
          const key = toDateKey(cell.date);
          const isPast = cell.date < today;
          const isToday = key === toDateKey(today);
          const isSelected = key === dateKey;
          return (
            <button
              key={key}
              type="button"
              disabled={isPast || locked}
              onClick={() => setDateKey(key)}
              className={cn(
                "flex h-8 items-center justify-center rounded-lg text-[12px] font-semibold outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
                isPast && "cursor-not-allowed text-[var(--inbox-text-muted)]/40",
                !isPast && !isSelected && "hover:bg-[var(--glass-bg-strong)]",
                isToday && !isSelected && "ring-1 ring-[var(--inbox-brand)]/40",
                isSelected &&
                  "bg-[var(--inbox-brand)] text-[var(--color-primary-foreground)]",
              )}
            >
              {cell.date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="mb-3 grid max-h-28 grid-cols-4 gap-1 overflow-y-auto pr-0.5">
        {TIME_SLOTS.map((slot) => {
          const slotDate = dateKey ? combineLocal(dateKey, slot) : null;
          const slotPast = slotDate ? slotDate.getTime() <= Date.now() : false;
          const isSelected = time === slot;
          return (
            <button
              key={slot}
              type="button"
              disabled={!dateKey || slotPast || locked}
              onClick={() => setTime(slot)}
              className={cn(
                "rounded-lg border px-1 py-1 font-display text-[11px] font-semibold tabular-nums outline-none",
                "focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
                isSelected
                  ? "border-[var(--inbox-brand)] bg-[var(--inbox-brand)] text-[var(--color-primary-foreground)]"
                  : "border-[var(--inbox-border)] text-[var(--inbox-text)] hover:bg-[var(--glass-bg-strong)]",
                (!dateKey || slotPast) && "cursor-not-allowed opacity-40 hover:bg-transparent",
              )}
            >
              {slot}
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-2 border-t border-border bg-[var(--glass-bg-modal)] pt-3">
        <p className="min-w-0 truncate text-[12px] text-[var(--inbox-text-muted)]">
          {selected ? (
            <>
              <IconCalendarEvent size={13} className="mr-1 inline align-[-2px]" aria-hidden />
              {formatConfirmWhen(selected.toISOString())}
            </>
          ) : (
            "Escolha data e hora"
          )}
        </p>
        <button
          type="button"
          disabled={!canSave || locked}
          onClick={() => selected && onSave(selected)}
          className={cn(
            "inline-flex h-9 shrink-0 items-center rounded-full px-4 font-display text-[13px] font-semibold",
            "outline-none focus-visible:ring-2 focus-visible:ring-[var(--inbox-focus)]",
            canSave
              ? "bg-[var(--inbox-brand)] text-[var(--color-primary-foreground)]"
              : "bg-[var(--glass-bg-strong)] text-[var(--inbox-text-muted)]",
          )}
        >
          Salvar
        </button>
      </div>
    </div>
  );
}
