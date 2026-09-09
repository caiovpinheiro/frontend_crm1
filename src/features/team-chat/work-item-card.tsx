"use client";

import { useState } from "react";
import { Calendar, CheckSquare, Link2, Video } from "lucide-react";
import { toast } from "sonner";

import { ButtonGlass } from "@/components/crm/button-glass";
import { cn } from "@/lib/utils";

import {
  addWorkItemEntry,
  generateChecklistFromMeeting,
  updateTeamChatWorkItem,
  updateWorkItemEntry,
} from "./api";
import { RecordCard } from "./record-card";
import type { WorkItem } from "./types";

const TYPE_LABEL: Record<WorkItem["type"], string> = {
  checklist: "Checklist",
  ata: "Ata",
  pauta: "Pauta",
  feedback: "Feedback",
  meeting: "Reunião",
};

function formatWhen(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isDueSoon(iso: string | null) {
  if (!iso) return false;
  const due = new Date(iso);
  if (Number.isNaN(due.getTime())) return false;
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  return due.getTime() <= endOfToday.getTime();
}

export function WorkItemCard({
  item,
  onChange,
  onLinkRecord,
}: {
  item: WorkItem;
  onChange?: (next: WorkItem) => void;
  onLinkRecord?: (item: WorkItem) => void;
}) {
  const [adding, setAdding] = useState("");
  const [busy, setBusy] = useState(false);
  const pct = item.total > 0 ? Math.round((item.done / item.total) * 100) : 0;
  const statusLabel =
    item.total === 0 ? "Sem itens" : item.done === item.total ? "Concluído" : "Em aberto";

  async function toggle(entryId: string, status: "open" | "done") {
    try {
      const next = await updateWorkItemEntry(item.id, entryId, {
        status: status === "done" ? "open" : "done",
      });
      onChange?.(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  async function addLine() {
    const text = adding.trim();
    if (!text) return;
    setBusy(true);
    try {
      const next = await addWorkItemEntry(item.id, { text });
      setAdding("");
      onChange?.(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  async function fromMeeting() {
    setBusy(true);
    try {
      const next = await generateChecklistFromMeeting(item.id);
      toast.success("Checklist da ata criado.");
      onChange?.(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível gerar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-[26rem] rounded-xl border border-border bg-card p-3 text-left">
      <div className="flex items-start gap-2">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          {item.type === "meeting" ? <Calendar className="size-4" /> : <CheckSquare className="size-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {TYPE_LABEL[item.type]}
            {item.total > 0 ? ` · ${item.done} de ${item.total} concluídos` : ""}
          </p>
          <p className="truncate text-[14px] font-semibold text-foreground">{item.title}</p>
          <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {statusLabel}
          </span>
          {item.type === "meeting" && (
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {formatWhen(item.startsAt) ?? "Sem horário"}
              {item.endsAt ? ` – ${formatWhen(item.endsAt)}` : ""}
            </p>
          )}
        </div>
      </div>

      {item.callUrl && (
        <a
          href={item.callUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline"
        >
          <Video className="size-3.5" />
          Entrar na chamada
        </a>
      )}

      {item.total > 0 && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
      )}

      {item.type === "meeting" && item.participantIds.length > 0 && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          {item.participantIds.length} participante{item.participantIds.length === 1 ? "" : "s"}
        </p>
      )}

      <ul className="mt-3 space-y-1.5">
        {item.entries.map((entry) => (
          <li key={entry.id} className="flex items-start gap-2">
            <button
              type="button"
              aria-label={entry.status === "done" ? "Reabrir item" : "Concluir item"}
              onClick={() => void toggle(entry.id, entry.status)}
              className={cn(
                "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                entry.status === "done"
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card",
              )}
            >
              {entry.status === "done" && <span className="text-[10px] leading-none">✓</span>}
            </button>
            <div className="min-w-0 flex-1">
              <p
                className={cn(
                  "text-[13px] leading-snug",
                  entry.status === "done" ? "text-muted-foreground line-through" : "text-foreground",
                )}
              >
                {entry.text}
              </p>
              {(entry.assigneeName || entry.dueAt) && (
                <p
                  className={cn(
                    "text-[11px]",
                    entry.status !== "done" && isDueSoon(entry.dueAt)
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {entry.assigneeName}
                  {entry.dueAt
                    ? `${entry.assigneeName ? " · " : ""}até ${formatWhen(entry.dueAt)}`
                    : ""}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex gap-2">
        <input
          value={adding}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void addLine();
            }
          }}
          placeholder="Novo item"
          className="h-8 flex-1 rounded-xl border border-border bg-card px-2.5 text-[13px] outline-none"
        />
        <ButtonGlass type="button" variant="glass" disabled={busy} onClick={() => void addLine()}>
          Adicionar
        </ButtonGlass>
      </div>

      {item.type === "meeting" && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void fromMeeting()}
          className="mt-2 text-[12px] font-semibold text-primary hover:underline disabled:opacity-50"
        >
          Gerar checklist da ata
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-2">
        {item.crmCard ? (
          <RecordCard card={item.crmCard} />
        ) : (
          <button
            type="button"
            onClick={() => onLinkRecord?.(item)}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
          >
            <Link2 className="size-3.5" />
            {item.originLabel ?? "Vincular a um registro"}
          </button>
        )}
      </div>
    </div>
  );
}

export async function linkWorkItemAnchor(
  itemId: string,
  anchor: { type: string; id: string } | null,
) {
  return updateTeamChatWorkItem(itemId, { anchor });
}
