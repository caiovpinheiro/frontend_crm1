"use client";

import { useQuery } from "@tanstack/react-query";
import { Briefcase, Lock, MessageSquare, User } from "lucide-react";

import { cn } from "@/lib/utils";

import { previewTeamChatRecord } from "./api";
import type { CrmAnchorType, CrmCard, OpenCrmCard } from "./types";

function formatValue(value: number | null) {
  if (value == null || Number.isNaN(value)) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function isCrmAnchor(type?: string | null): type is CrmAnchorType {
  return type === "deal" || type === "conversation" || type === "contact";
}

export function RecordCard({
  card,
  className,
  onOpen,
}: {
  card: CrmCard;
  className?: string;
  onOpen?: (card: OpenCrmCard) => void;
}) {
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
  const clickable = Boolean(onOpen);
  const meta = (
    <>
      <p className="truncate text-[13px] font-semibold text-foreground">{card.title}</p>
      <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
        {card.typeLabel}
        {card.number != null ? ` #${card.number}` : ""}
        {card.status ? ` · ${card.status}` : ""}
        {card.ownerName ? ` · ${card.ownerName}` : ""}
        {value ? ` · ${value}` : ""}
      </p>
      {clickable ? (
        <span className="mt-1.5 inline-flex text-[12px] font-semibold text-primary">Abrir aqui</span>
      ) : null}
    </>
  );

  const body = (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">{meta}</div>
    </>
  );

  const surface = cn(
    "flex w-full max-w-[22rem] items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left",
    clickable && "transition-colors hover:bg-muted/50",
    className,
  );

  if (clickable) {
    return (
      <button type="button" onClick={() => onOpen?.(card)} className={surface}>
        {body}
      </button>
    );
  }

  return <div className={surface}>{body}</div>;
}

export function LinkedRecordCard({
  card,
  anchorRef,
  onOpen,
  className,
}: {
  card?: CrmCard | null;
  anchorRef?: { type: string; id: string } | null;
  onOpen?: (card: OpenCrmCard) => void;
  className?: string;
}) {
  const type = card && !card.restricted ? card.type : isCrmAnchor(anchorRef?.type) ? anchorRef.type : null;
  const id = card && !card.restricted ? card.id : type && anchorRef ? anchorRef.id : null;
  const preview = useQuery({
    queryKey: ["team-chat-record-preview", type, id],
    queryFn: () => previewTeamChatRecord(type!, id!),
    enabled: !card && Boolean(type && id),
    staleTime: 60_000,
  });
  const resolved = card ?? preview.data?.card ?? null;

  if (!resolved) {
    if (!type || !id) return null;
    if (preview.isError) return null;
    return (
      <div
        className={cn("h-14 w-full max-w-[22rem] animate-pulse rounded-xl border border-border bg-muted", className)}
        aria-hidden
      />
    );
  }

  return <RecordCard card={resolved} onOpen={onOpen} className={className} />;
}
