"use client";

import { Briefcase, Lock, MessageSquare, User } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import type { CrmCard } from "./types";

function formatValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function RecordCard({ card, className }: { card: CrmCard; className?: string }) {
  if (card.restricted) {
    return (
      <div
        className={cn(
          "flex w-full max-w-[22rem] items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left",
          className,
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Lock className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">Registro restrito</p>
          <p className="text-[12px] text-muted-foreground">{card.typeLabel}</p>
        </div>
      </div>
    );
  }

  const Icon = card.type === "deal" ? Briefcase : card.type === "conversation" ? MessageSquare : User;
  const value = formatValue(card.value);

  return (
    <div
      className={cn(
        "flex w-full max-w-[22rem] items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left",
        className,
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-foreground">{card.title}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
          {card.typeLabel}
          {card.number != null ? ` #${card.number}` : ""}
          {card.status ? ` · ${card.status}` : ""}
          {card.ownerName ? ` · ${card.ownerName}` : ""}
          {value ? ` · ${value}` : ""}
        </p>
        <Link
          href={card.href}
          className="mt-1.5 inline-flex text-[12px] font-semibold text-primary hover:underline"
        >
          Abrir
        </Link>
      </div>
    </div>
  );
}
