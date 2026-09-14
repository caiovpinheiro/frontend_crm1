"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckSquare, Plus, StickyNote, X } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { addWorkItemEntry, createTeamChatWorkItem, updateWorkItemEntry } from "./api";
import { NotesPanel } from "./notes-panel";
import { TopicAssigneePicker } from "./topic-assignee";
import type { TeamChatNote, WorkItem, WorkItemEntry } from "./types";
import { agendaKindLabel, isAgendaWorkItem, WorkItemManageButtons } from "./work-item-dialogs";

type DetailsTab = "activities" | "notes";

type FlatEntry = {
  workItemId: string;
  workItemTitle: string;
  entry: WorkItemEntry;
};

function pickActivityItem(items: WorkItem[]): WorkItem | null {
  return items.find((item) => item.type === "checklist" || item.type === "ata") ?? items[0] ?? null;
}

function isMine(row: FlatEntry, meId: string) {
  return Boolean(meId) && row.entry.assigneeId === meId;
}

function ActivitiesPane({
  roomId,
  meId,
  items,
  onChange,
  onDeleted,
}: {
  roomId: string;
  meId: string;
  items: WorkItem[];
  onChange: (item: WorkItem) => void;
  onDeleted?: (id: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const rows = useMemo<FlatEntry[]>(() => {
    const out: FlatEntry[] = [];
    for (const item of items) {
      for (const entry of item.entries) {
        out.push({ workItemId: item.id, workItemTitle: item.title, entry });
      }
    }
    return out;
  }, [items]);

  const pending = rows.filter((row) => row.entry.status === "open");
  const done = rows.filter((row) => row.entry.status === "done");
  const total = rows.length;
  const finished = done.length;
  const pct = total > 0 ? Math.round((finished / total) * 100) : 0;

  async function assign(row: FlatEntry, assigneeId: string | null) {
    try {
      const next = await updateWorkItemEntry(row.workItemId, row.entry.id, { assigneeId });
      onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atribuir.");
    }
  }

  async function toggle(row: FlatEntry) {
    try {
      const next = await updateWorkItemEntry(row.workItemId, row.entry.id, {
        status: row.entry.status === "done" ? "open" : "done",
      });
      onChange(next);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar.");
    }
  }

  async function addTopic() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      const target = pickActivityItem(items);
      if (target) {
        const next = await addWorkItemEntry(target.id, { text });
        onChange(next);
      } else {
        const created = await createTeamChatWorkItem({
          type: "checklist",
          title: "Atividades",
          originType: "room",
          originId: roomId,
          roomId,
          entries: [{ text }],
          postMessage: false,
        });
        onChange(created);
      }
      setDraft("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar.");
    } finally {
      setBusy(false);
    }
  }

  const agendas = items.filter(isAgendaWorkItem);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {agendas.length > 0 ? (
        <section className="border-b border-border px-4 py-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Agendas e atas
          </h3>
          <ul className="flex flex-col gap-1.5">
            {agendas.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {agendaKindLabel(item)}
                  </p>
                  <p className="truncate text-[13px] font-semibold text-foreground">{item.title}</p>
                </div>
                <WorkItemManageButtons item={item} onUpdated={onChange} onDeleted={onDeleted} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-[12px] text-muted-foreground">
          <span>
            {finished} de {total} feitos
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              if (e.key === "Enter") {
                e.preventDefault();
                void addTopic();
              }
            }}
            placeholder="Novo tópico"
            className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-muted px-3 text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => void addTopic()}
            disabled={!draft.trim() || busy}
            aria-label="Adicionar tópico"
            className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="chat-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        <ActivitySection
          title="Pendente"
          empty="Nada pendente."
          rows={pending}
          meId={meId}
          onToggle={toggle}
          onAssign={assign}
        />
        <ActivitySection
          title="Feito"
          empty="Nada concluído ainda."
          rows={done}
          meId={meId}
          onToggle={toggle}
          onAssign={assign}
        />
      </div>
    </div>
  );
}

function ActivitySection({
  title,
  empty,
  rows,
  meId,
  onToggle,
  onAssign,
}: {
  title: string;
  empty: string;
  rows: FlatEntry[];
  meId: string;
  onToggle: (row: FlatEntry) => void;
  onAssign: (row: FlatEntry, assigneeId: string | null) => void;
}) {
  const mine = rows.filter((row) => isMine(row, meId));
  const rest = rows.filter((row) => !isMine(row, meId));

  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="ml-1.5 tabular-nums text-muted-foreground">({rows.length})</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {mine.length > 0 ? (
            <ActivityGroup
              label="Sua responsabilidade"
              rows={mine}
              highlight
              onToggle={onToggle}
              onAssign={onAssign}
            />
          ) : null}
          {rest.length > 0 ? (
            <ActivityGroup
              label={mine.length > 0 ? "Demais tópicos" : undefined}
              rows={rest}
              onToggle={onToggle}
              onAssign={onAssign}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}

function ActivityGroup({
  label,
  rows,
  highlight,
  onToggle,
  onAssign,
}: {
  label?: string;
  rows: FlatEntry[];
  highlight?: boolean;
  onToggle: (row: FlatEntry) => void;
  onAssign: (row: FlatEntry, assigneeId: string | null) => void;
}) {
  return (
    <div>
      {label ? (
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
          <span className="ml-1 tabular-nums">({rows.length})</span>
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const done = row.entry.status === "done";
          return (
            <li key={row.entry.id}>
              <div
                className={cn(
                  "flex items-start gap-2 rounded-lg border px-2.5 py-2",
                  highlight
                    ? "border-primary/25 bg-primary/8"
                    : "border-border bg-muted/60",
                )}
              >
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => onToggle(row)}
                    className="mt-0.5 size-4 accent-[var(--color-success)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block text-[13px] leading-snug text-foreground",
                        done && "text-muted-foreground line-through",
                      )}
                    >
                      {row.entry.text}
                    </span>
                    {row.workItemTitle ? (
                      <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                        {row.workItemTitle}
                      </span>
                    ) : null}
                  </span>
                </label>
                <TopicAssigneePicker
                  assigneeId={row.entry.assigneeId}
                  assigneeName={row.entry.assigneeName}
                  onChange={(next) => onAssign(row, next.id)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DetailsPanel({
  roomId,
  meId,
  notes,
  workItems,
  onAddNote,
  onToggleNotePin,
  onDeleteNote,
  onWorkItemChange,
  onWorkItemDeleted,
  onClose,
}: {
  roomId: string;
  meId: string;
  notes: TeamChatNote[];
  workItems: WorkItem[];
  onAddNote: (text: string) => void;
  onToggleNotePin: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onWorkItemChange: (item: WorkItem) => void;
  onWorkItemDeleted?: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<DetailsTab>("activities");

  return (
    <aside className="flex h-full flex-col border-l border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Detalhes</h2>
          <p className="text-[11px] text-muted-foreground">Atividades da conversa e notas privadas</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar detalhes"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div role="tablist" aria-label="Painel da conversa" className="flex gap-1 border-b border-border px-3 py-2">
        <TabButton
          active={tab === "activities"}
          icon={<CheckSquare className="h-3.5 w-3.5" />}
          onClick={() => setTab("activities")}
        >
          Atividades
        </TabButton>
        <TabButton
          active={tab === "notes"}
          icon={<StickyNote className="h-3.5 w-3.5" />}
          onClick={() => setTab("notes")}
        >
          Notas
        </TabButton>
      </div>
      {tab === "activities" ? (
        <ActivitiesPane
          roomId={roomId}
          meId={meId}
          items={workItems}
          onChange={onWorkItemChange}
          onDeleted={onWorkItemDeleted}
        />
      ) : (
        <NotesPanel
          notes={notes}
          embedded
          onAdd={onAddNote}
          onTogglePin={onToggleNotePin}
          onDelete={onDeleteNote}
          onClose={onClose}
        />
      )}
    </aside>
  );
}

function TabButton({
  active,
  icon,
  onClick,
  children,
}: {
  active: boolean;
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
