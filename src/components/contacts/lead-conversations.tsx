"use client";

import { apiUrl } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconArrowLeft as ArrowLeft, IconCalendar as Calendar, IconCircleCheck as CheckCircle2, IconClock as Clock, IconFileText as FileText, IconLoader2 as Loader2, IconMessage as MessageSquare, IconPlus as Plus } from "@tabler/icons-react";
import * as React from "react";

import { ChannelBadge } from "@/components/inbox/channel-badge";
import { ChatWindow } from "@/components/inbox/chat-window-lazy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";

type ConversationRow = {
  id: string;
  externalId: string | null;
  channel: string;
  status: string;
  inboxName: string | null;
  createdAt: string;
  updatedAt: string;
};

type ActivityRow = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  completed: boolean;
  scheduledAt: string | null;
  completedAt: string | null;
  createdAt: string;
  user: { id: string; name: string };
  deal: { id: string; title: string } | null;
};

type NoteRow = {
  id: string;
  content: string;
  createdAt: string;
  user: { id: string; name: string };
};

type ContactSlim = {
  id: string;
  conversations: ConversationRow[];
  activities: ActivityRow[];
  notes: NoteRow[];
};

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  CALL: "Ligação",
  EMAIL: "E-mail",
  MEETING: "Reunião",
  TASK: "Tarefa",
  NOTE: "Nota",
  WHATSAPP: "WhatsApp",
  OTHER: "Outro",
};

const ACTIVITY_TYPE_ICON: Record<string, string> = {
  CALL: "📞",
  EMAIL: "📧",
  MEETING: "🤝",
  TASK: "✅",
  NOTE: "📝",
  WHATSAPP: "💬",
  OTHER: "📌",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Aberto",
  RESOLVED: "Resolvido",
  PENDING: "Pendente",
  SNOOZED: "Adiado",
};

export function LeadConversations({ contact }: { contact: ContactSlim }) {
  const [tab, setTab] = React.useState<"conversations" | "activities" | "notes">("conversations");
  const [selectedConv, setSelectedConv] = React.useState<ConversationRow | null>(null);
  const [convStatus, setConvStatus] = React.useState<string>("");

  React.useEffect(() => {
    setSelectedConv(null);
    setConvStatus("");
  }, [contact.id]);

  return (
    <div className="flex min-h-[600px] flex-col rounded-xl border border-border/80 bg-card shadow-sm">
      {/* Tab bar */}
      <div className="flex items-center border-b border-border/60 px-4 pt-3 pb-0">
        <Tabs value={tab} onValueChange={(v) => { setTab(v as typeof tab); setSelectedConv(null); }}>
          <TabsList className="h-9 bg-transparent p-0">
            <TabsTrigger value="conversations" className="gap-1.5 data-[state=active]:shadow-none">
              <MessageSquare className="size-3.5" /> Conversas
              {contact.conversations.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 min-w-[20px] px-1 text-[10px]">
                  {contact.conversations.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="activities" className="gap-1.5 data-[state=active]:shadow-none">
              <Calendar className="size-3.5" /> Tarefas
            </TabsTrigger>
            <TabsTrigger value="notes" className="gap-1.5 data-[state=active]:shadow-none">
              <FileText className="size-3.5" /> Notas
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col">
        {tab === "conversations" && (
          <ConversationsTab
            conversations={contact.conversations}
            selected={selectedConv}
            onSelect={(c) => { setSelectedConv(c); setConvStatus(c?.status ?? ""); }}
            convStatus={convStatus}
            onStatusChange={setConvStatus}
          />
        )}
        {tab === "activities" && <ActivitiesTab activities={contact.activities} />}
        {tab === "notes" && <NotesTab contactId={contact.id} notes={contact.notes} />}
      </div>
    </div>
  );
}

function ConversationsTab({
  conversations,
  selected,
  onSelect,
  convStatus,
  onStatusChange,
}: {
  conversations: ConversationRow[];
  selected: ConversationRow | null;
  onSelect: (c: ConversationRow | null) => void;
  convStatus: string;
  onStatusChange: (s: string) => void;
}) {
  if (selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => onSelect(null)}
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <ChannelBadge channel={selected.channel} />
              {selected.inboxName && (
                <span className="text-xs font-medium text-muted-foreground">{selected.inboxName}</span>
              )}
              <Badge variant="outline" className="text-[10px]">
                {STATUS_LABEL[selected.status] ?? selected.status}
              </Badge>
            </div>
          </div>
        </div>
        <ChatWindow
          conversationId={selected.id}
          conversationStatus={convStatus || selected.status}
          onResolve={(s) => onStatusChange(s)}
          onReopen={(s) => onStatusChange(s)}
        />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="mb-3 size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">
          Nenhuma conversa encontrada para este contato.
        </p>
        <p className="mt-1 text-xs text-muted-foreground/70">
          As conversas aparecem automaticamente quando há interação via WhatsApp, Instagram ou outros canais.
        </p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c)}
          className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <ChannelBadge channel={c.channel} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {c.inboxName && (
                <span className="text-sm font-medium">{c.inboxName}</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(c.updatedAt), { addSuffix: true, locale: ptBR })}
            </p>
          </div>
          <Badge
            variant={c.status === "OPEN" ? "default" : c.status === "RESOLVED" ? "success" : "secondary"}
            className="text-[10px]"
          >
            {STATUS_LABEL[c.status] ?? c.status}
          </Badge>
        </button>
      ))}
    </div>
  );
}

function ActivitiesTab({ activities }: { activities: ActivityRow[] }) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <Calendar className="mb-3 size-10 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Nenhuma tarefa registrada.</p>
      </div>
    );
  }

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
      <div className="relative space-y-0">
        {activities.map((a, idx) => (
          <div key={a.id} className="relative flex gap-3 pb-6">
            {idx < activities.length - 1 && (
              <div className="absolute left-[15px] top-8 bottom-0 w-px bg-border/60" />
            )}
            <div
              className={cn(
                "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm",
                a.completed
                  ? "border-emerald-500/40 bg-[var(--color-success-bg)] dark:bg-emerald-950/40"
                  : "border-border bg-muted/40"
              )}
            >
              {ACTIVITY_TYPE_ICON[a.type] ?? "📌"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{a.title}</span>
                <Badge variant="outline" className="text-[10px]">
                  {ACTIVITY_TYPE_LABEL[a.type] ?? a.type}
                </Badge>
                {a.completed && (
                  <CheckCircle2 className="size-3.5 text-[var(--color-success)]" />
                )}
              </div>
              {a.description && (
                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.description}</p>
              )}
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{a.user.name}</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatDateTime(a.createdAt)}
                </span>
                {a.deal && (
                  <span className="inline-flex items-center gap-1">
                    🤝 {a.deal.title}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NotesTab({ contactId, notes: initialNotes }: { contactId: string; notes: NoteRow[] }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState("");

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch(apiUrl(`/api/contacts/${contactId}/notes`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) throw new Error("Erro ao criar nota");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      setDraft("");
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.trim()) createMutation.mutate(draft.trim());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {initialNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {initialNotes.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border border-border/60 bg-muted/20 p-3"
              >
                <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{n.user.name}</span>
                  <span>·</span>
                  <span>{formatDateTime(n.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <form onSubmit={onSubmit} className="flex gap-2 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma nota…"
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0 rounded-xl bg-[var(--color-brand-primary)] hover:bg-indigo-700"
          disabled={!draft.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Plus className="size-5" />
          )}
        </Button>
      </form>
    </div>
  );
}
