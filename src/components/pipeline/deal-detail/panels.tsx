"use client";

import { apiUrl } from "@/lib/api";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { IconArrowLeft as ArrowLeft, IconCalendar as Calendar, IconClock as Clock, IconFileText as FileText, IconLoader2 as Loader2, IconMessage as MessageSquare, IconPlus as Plus, IconSend as Send } from "@tabler/icons-react";

import { ChannelBadge } from "@/components/inbox/channel-badge";
import { ChatWindow } from "@/components/inbox/chat-window-lazy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

import { ConversationRow, DealDetailActivity, DealDetailNote, STATUS_LABEL } from "./shared";
import { ActivitiesPanel as CanonicalActivitiesPanel } from "@/components/pipeline/deal-workspace/panels/activities";

export type RightTabValue = "conversations" | "activities" | "notes" | "timeline";

type DealTabsProps = {
  rightTab: RightTabValue;
  setRightTab: (tab: RightTabValue) => void;
  conversationsCount: number;
  activitiesCount: number;
  notesCount: number;
};

export function DealTabs({
  rightTab,
  setRightTab,
  conversationsCount,
  activitiesCount,
  notesCount,
}: DealTabsProps) {
  return (
    <div className="border-b border-border/60 bg-white px-5 py-3">
      <Tabs value={rightTab} onValueChange={(v) => setRightTab(v as typeof rightTab)}>
        <TabsList className="h-auto rounded-xl border border-border bg-[var(--color-bg-subtle)] p-1 shadow-sm">
          <TabsTrigger
            value="conversations"
            className="gap-1.5 rounded-lg px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm"
          >
            <MessageSquare className="size-3.5" /> Conversas
            {conversationsCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-[16px] px-1 text-[9px]">
                {conversationsCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="activities"
            className="gap-1.5 rounded-lg px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm"
          >
            <Calendar className="size-3.5" /> Tarefas
            {activitiesCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-[16px] px-1 text-[9px]">
                {activitiesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="gap-1.5 rounded-lg px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm"
          >
            <FileText className="size-3.5" /> Notas
            {notesCount > 0 && (
              <Badge variant="secondary" className="ml-0.5 h-4 min-w-[16px] px-1 text-[9px]">
                {notesCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger
            value="timeline"
            className="gap-1.5 rounded-lg px-4 py-2 text-sm data-[state=active]:bg-white data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-sm"
          >
            <Clock className="size-3.5" /> Timeline
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

type ConversationsPanelProps = {
  conversations: ConversationRow[];
  selected: ConversationRow | null;
  onSelect: (c: ConversationRow | null) => void;
  convStatus: string;
  onStatusChange: (s: string) => void;
  contactId?: string;
  contactPhone?: string | null;
  onConversationCreated?: () => void;
};

export function ConversationsPanel({
  conversations,
  selected,
  onSelect,
  convStatus,
  onStatusChange,
  contactId,
  onConversationCreated,
}: ConversationsPanelProps) {
  const queryClient = useQueryClient();
  const autoCreatedRef = React.useRef(false);

  const autoCreateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(apiUrl("/api/conversations/create"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          skipSend: true,
          source: "deal_panel",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Erro ao criar conversa");
      return data.conversation as {
        id: string;
        externalId: string | null;
        channel: string;
        status: string;
        inboxName: string | null;
        createdAt: string;
        updatedAt: string;
      };
    },
    onSuccess: (conv) => {
      if (contactId) queryClient.invalidateQueries({ queryKey: ["contact", contactId] });
      onConversationCreated?.();
      onSelect({
        id: conv.id,
        externalId: conv.externalId,
        channel: conv.channel,
        status: conv.status,
        inboxName: conv.inboxName,
        createdAt: conv.createdAt,
        updatedAt: conv.updatedAt,
      });
    },
  });

  React.useEffect(() => {
    if (conversations.length === 0 && contactId && !selected && !autoCreatedRef.current && !autoCreateMutation.isPending) {
      autoCreatedRef.current = true;
      autoCreateMutation.mutate();
    }
  }, [conversations.length, contactId, selected]);

  if (selected) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="flex items-center gap-2 border-b border-border/40 bg-white px-4 py-3">
          {conversations.length > 1 && (
            <Button type="button" variant="ghost" size="icon" className="size-8 rounded-xl" onClick={() => onSelect(null)}>
              <ArrowLeft className="size-4" />
            </Button>
          )}
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
        <ChatWindow
          conversationId={selected.id}
          conversationStatus={convStatus || selected.status}
          onResolve={(s) => onStatusChange(s)}
          onReopen={(s) => onStatusChange(s)}
          compactChrome
        />
      </div>
    );
  }

  if (autoCreateMutation.isPending) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8">
        <Loader2 className="mb-3 size-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Abrindo chat…</p>
      </div>
    );
  }

  if (autoCreateMutation.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <MessageSquare className="mb-3 size-12 text-muted-foreground/25" />
        <p className="text-sm text-destructive">
          {autoCreateMutation.error instanceof Error ? autoCreateMutation.error.message : "Erro ao abrir chat."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => {
            autoCreatedRef.current = false;
            autoCreateMutation.mutate();
          }}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-white">
      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <Send className="mb-3 size-12 text-muted-foreground/25" />
          <p className="text-sm text-muted-foreground">Abrindo conversa…</p>
        </div>
      ) : (
        <div className="scrollbar-thin flex-1 overflow-y-auto bg-white">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelect(c)}
              className="flex w-full items-center gap-3 border-b border-border/40 px-5 py-4 text-left transition-colors hover:bg-[var(--color-bg-subtle)]/80"
            >
              <ChannelBadge channel={c.channel} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {c.inboxName && <span className="text-sm font-medium">{c.inboxName}</span>}
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
      )}
    </div>
  );
}

type ActivitiesPanelProps = {
  dealId: string;
  onCreated?: () => void;
  contactId?: string | null;
  contactName?: string | null;
  dealTitle?: string | null;
  /** @deprecated Ignorado — lista vem dos hooks canônicos. */
  activities?: DealDetailActivity[];
};

/** Alinha o painel legado ao composer/hooks canônicos (sem reorganizar pastas). */
export function ActivitiesPanel({
  dealId,
  onCreated,
  contactId,
  contactName,
  dealTitle,
}: ActivitiesPanelProps) {
  return (
    <CanonicalActivitiesPanel
      dealId={dealId}
      contactId={contactId}
      contactName={contactName}
      dealTitle={dealTitle}
      onCreated={onCreated}
    />
  );
}

type NotesPanelProps = {
  notes: DealDetailNote[];
  contactId: string | undefined;
  dealId: string;
  onCreated: () => void;
};

export function NotesPanel({ notes, contactId, dealId, onCreated }: NotesPanelProps) {
  const [draft, setDraft] = React.useState("");

  const mutation = useMutation({
    mutationFn: async (content: string) => {
      const endpoint = contactId ? `/api/contacts/${contactId}/notes` : `/api/deals/${dealId}/notes`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, dealId }),
      });
      if (!res.ok) throw new Error("Erro ao criar nota");
      return res.json();
    },
    onSuccess: () => {
      setDraft("");
      onCreated();
    },
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="scrollbar-thin flex-1 overflow-y-auto p-4">
        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-3 size-10 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-2xl border border-border bg-white p-4 shadow-sm">
                <p className="whitespace-pre-wrap text-sm">{n.content}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {n.user.name} · {formatDateTime(n.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <Separator />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) mutation.mutate(draft.trim());
        }}
        className="flex gap-2 p-3"
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma nota…"
          rows={2}
          className="min-h-[44px] flex-1 resize-none"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (draft.trim()) mutation.mutate(draft.trim());
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90"
          disabled={!draft.trim() || mutation.isPending}
        >
          {mutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Plus className="size-5" />}
        </Button>
      </form>
    </div>
  );
}
