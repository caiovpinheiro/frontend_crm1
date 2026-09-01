"use client";

import { IconCalendarEvent, IconCircleCheck } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type ResolveMode = "finalize" | "follow_up";

export function ResolveModeToggle({
  value,
  onChange,
}: {
  value: ResolveMode;
  onChange: (mode: ResolveMode) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Como encerrar"
      className="grid grid-cols-2 gap-2"
    >
      <ModeCard
        active={value === "finalize"}
        onClick={() => onChange("finalize")}
        icon={<IconCircleCheck size={18} />}
        title="Finalizar"
        hint="Vai para Encerradas."
      />
      <ModeCard
        active={value === "follow_up"}
        onClick={() => onChange("follow_up")}
        icon={<IconCalendarEvent size={18} />}
        title="Acompanhar"
        hint="Fica em Resolvido e abre uma tarefa."
      />
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-3 text-left transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border bg-card text-muted-foreground hover:border-primary/30",
      )}
    >
      <span
        className={cn(
          "mb-1.5 flex size-8 items-center justify-center rounded-full",
          active ? "bg-primary/15 text-primary" : "bg-secondary",
        )}
      >
        {icon}
      </span>
      <span className="block text-sm font-semibold text-foreground">{title}</span>
      <span className="mt-0.5 block text-[11px] leading-snug">{hint}</span>
    </button>
  );
}
