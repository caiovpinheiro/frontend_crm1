"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { BwipoWordmark } from "@/components/bwipo/bwipo-logo";
import { AppLoading } from "@/components/crm/app-loading";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { cn } from "@/lib/utils";

import { ChatHeader } from "./chat-header";
import { AddMembersDialog, ComposeDialog } from "./compose-dialogs";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { NotesPanel } from "./notes-panel";
import { Sidebar } from "./sidebar";
import {
  useTeamChatColleagues,
  useTeamChatMessages,
  useTeamChatMutations,
  useTeamChatNotes,
  useTeamChatRealtime,
  useTeamChatRooms,
  useTeamChatTyping,
  usePingTeamChatTyping,
  useOrbitaFavorites,
} from "./hooks";
import { favoriteKey } from "./helpers";
import type { DirectRow, TeamChatRoom } from "./types";

export function TeamChatApp() {
  const { data: session, status } = useSession();
  const meId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);

  const ready = status === "authenticated";
  const roomsQuery = useTeamChatRooms(ready);
  const peopleQuery = useTeamChatColleagues(ready);
  const { favorites, toggleFavorite } = useOrbitaFavorites();
  const typing = useTeamChatTyping(meId, ready);
  const rooms = roomsQuery.data?.rooms ?? [];
  const colleagues = peopleQuery.data?.colleagues ?? [];
  useTeamChatRealtime(selectedId, ready);

  const { createRoom } = useTeamChatMutations();

  const directs = useMemo<DirectRow[]>(() => {
    const dms = rooms.filter((r) => r.kind === "DM");
    const byPeer = new Map<string, (typeof dms)[number]>();
    for (const r of dms) {
      if (r.peer?.id) byPeer.set(r.peer.id, r);
    }
    const seen = new Set<string>();
    const rows: DirectRow[] = [];
    for (const person of colleagues) {
      if (person.id === meId) continue;
      seen.add(person.id);
      rows.push({ person, room: byPeer.get(person.id) ?? null });
    }
    for (const r of dms) {
      if (r.peer && !seen.has(r.peer.id)) rows.push({ person: r.peer, room: r });
    }
    return rows.sort((a, b) => {
      const ta = a.room?.lastMessageAt ? new Date(a.room.lastMessageAt).getTime() : 0;
      const tb = b.room?.lastMessageAt ? new Date(b.room.lastMessageAt).getTime() : 0;
      if (tb !== ta) return tb - ta;
      return a.person.name.localeCompare(b.person.name, "pt-BR");
    });
  }, [rooms, colleagues, meId]);

  const groups = rooms.filter((r) => r.kind === "GROUP");
  const selected = rooms.find((r) => r.id === selectedId) ?? null;
  const notesQuery = useTeamChatNotes(selectedId, notesOpen || !!selectedId);
  const notes = notesQuery.data?.notes ?? [];

  function openPerson(personId: string) {
    const existing = rooms.find((r) => r.kind === "DM" && r.peer?.id === personId);
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    createRoom.mutate(
      { memberIds: [personId] },
      {
        onSuccess: (res) => setSelectedId(res.room.id),
        onError: (e: Error) => toast.error(e.message),
      },
    );
  }

  // Não usar só isLoading: no RQ v5, query disabled ou o frame
  // isPending+idle → isLoading=false + data=undefined → empty flash.
  const listBootstrapping =
    status === "loading" ||
    (ready &&
      ((!roomsQuery.data && !roomsQuery.isError) ||
        (!peopleQuery.data && !peopleQuery.isError)));
  const loadError =
    roomsQuery.error instanceof Error
      ? roomsQuery.error.message
      : peopleQuery.error instanceof Error
        ? peopleQuery.error.message
        : null;
  const retryBoot = () => {
    void roomsQuery.refetch();
    void peopleQuery.refetch();
  };
  const showBootGate = !selected && (listBootstrapping || !!loadError);

  return (
    <div className="team-chat-shell flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden">
      <div
        className={cn(
          "flex h-full min-h-0 w-[340px] min-w-[320px] shrink-0 flex-col border-r border-[var(--orbita-divider)]",
          selected ? "hidden lg:flex" : "flex",
        )}
      >
        <Sidebar
          directs={directs}
          groups={groups}
          activeId={selectedId}
          loading={listBootstrapping}
          error={directs.length === 0 && groups.length === 0 ? loadError : null}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onSelectRoom={(id) => {
            setSelectedId(id);
            setNotesOpen(false);
          }}
          onSelectPerson={(id) => {
            setNotesOpen(false);
            openPerson(id);
          }}
          onNew={() => setComposeOpen(true)}
          typing={typing}
        />
      </div>

      <section
        data-tour="bwipo-chat-stage"
        className={cn(
          "relative flex h-full min-h-0 min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden lg:flex",
        )}
      >
        {showBootGate ? (
          <AppLoading
            variant="inline"
            className="min-h-0 flex-1"
            error={loadError}
            onRetry={retryBoot}
          />
        ) : selected ? (
          <Thread
            room={selected}
            meId={meId}
            notesOpen={notesOpen}
            noteCount={notes.length}
            favorited={favorites.includes(
              favoriteKey({ roomId: selected.id, personId: selected.peer?.id }),
            )}
            onBack={() => setSelectedId(null)}
            onToggleNotes={() => setNotesOpen((v) => !v)}
            onToggleFavorite={() =>
              toggleFavorite(favoriteKey({ roomId: selected.id, personId: selected.peer?.id }))
            }
            onAddMembers={() => setAddOpen(true)}
          />
        ) : (
          <LandingEmpty />
        )}
      </section>

      {selected && notesOpen && (
        <>
          <div className="hidden h-full w-[320px] shrink-0 lg:block">
            <NotesHost roomId={selected.id} notes={notes} onClose={() => setNotesOpen(false)} />
          </div>
          <div className="absolute inset-0 z-20 lg:hidden">
            <NotesHost roomId={selected.id} notes={notes} onClose={() => setNotesOpen(false)} />
          </div>
        </>
      )}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        meId={meId}
        onCreated={(id) => {
          setSelectedId(id);
          setComposeOpen(false);
        }}
      />
      {selected?.kind === "GROUP" && (
        <AddMembersDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          room={selected}
          meId={meId}
        />
      )}
    </div>
  );
}

function NotesHost({
  roomId,
  notes,
  onClose,
}: {
  roomId: string;
  notes: { id: string; text: string; pinned: boolean; createdAt: string }[];
  onClose: () => void;
}) {
  const { addNote, toggleNotePin, removeNote } = useTeamChatMutations();
  return (
    <NotesPanel
      notes={notes}
      onAdd={(text) =>
        addNote.mutate({ roomId, content: text }, { onError: (e: Error) => toast.error(e.message) })
      }
      onTogglePin={(id) =>
        toggleNotePin.mutate({ noteId: id, roomId }, { onError: (e: Error) => toast.error(e.message) })
      }
      onDelete={(id) =>
        removeNote.mutate({ noteId: id, roomId }, { onError: (e: Error) => toast.error(e.message) })
      }
      onClose={onClose}
    />
  );
}

function Thread({
  room,
  meId,
  notesOpen,
  noteCount,
  favorited,
  onBack,
  onToggleNotes,
  onToggleFavorite,
  onAddMembers,
}: {
  room: TeamChatRoom;
  meId: string;
  notesOpen: boolean;
  noteCount: number;
  favorited: boolean;
  onBack: () => void;
  onToggleNotes: () => void;
  onToggleFavorite: () => void;
  onAddMembers: () => void;
}) {
  const { data, isError, error, refetch } = useTeamChatMessages(room.id);
  const { send, react, pin } = useTeamChatMutations();
  const messages = data?.messages ?? [];
  const messagesError =
    error instanceof Error ? error.message : isError ? "Não foi possível carregar as mensagens." : null;
  const [chatQuery, setChatQuery] = useState("");
  const [quote, setQuote] = useState<{ author: string; text: string } | null>(null);
  const pingTyping = usePingTeamChatTyping(room.id);

  useEffect(() => {
    setChatQuery("");
    setQuote(null);
  }, [room.id]);

  return (
    <div className="orbita-block flex min-h-0 flex-1 flex-col overflow-hidden">
      <div data-tour="bwipo-chat-header">
        <ChatHeader
          room={room}
          notesOpen={notesOpen}
          noteCount={noteCount}
          searchQuery={chatQuery}
          favorited={favorited}
          onSearchChange={setChatQuery}
          onBack={onBack}
          onToggleNotes={onToggleNotes}
          onToggleFavorite={onToggleFavorite}
          onAddMembers={onAddMembers}
        />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" data-wa-thread data-tour="bwipo-chat-messages">
        <MessageList
          room={room}
          messages={messages}
          meId={meId}
          error={messagesError}
          onRetry={() => {
            void refetch();
          }}
          query={chatQuery}
          onToggleReaction={(id, emoji) =>
            react.mutate({ roomId: room.id, messageId: id, emoji }, { onError: (e: Error) => toast.error(e.message) })
          }
          onTogglePin={(id) =>
            pin.mutate({ roomId: room.id, messageId: id }, { onError: (e: Error) => toast.error(e.message) })
          }
          onReply={(msg) =>
            setQuote({
              author: msg.author?.name ?? "Colega",
              text: msg.content.trim() || (msg.attachments?.[0]?.name ?? "Anexo"),
            })
          }
        />
        <div className="relative z-20 shrink-0 overflow-visible px-3 pb-4 pt-2" data-tour="bwipo-chat-composer">
          <div className="overflow-visible rounded-[16px] bg-[var(--orbita-block)] ring-1 ring-[var(--orbita-divider)] shadow-[0_8px_24px_rgba(91,111,245,0.08)]">
            <Composer
              roomId={room.id}
              placeholder="Digite uma mensagem"
              quote={quote}
              onTyping={pingTyping}
              onClearQuote={() => setQuote(null)}
              onSend={async (payload) => {
                await send.mutateAsync({
                  roomId: room.id,
                  content: payload.content,
                  attachments: payload.attachments,
                });
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function LandingEmpty() {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center px-6"
      data-wa-thread
    >
      <div
        className={cn(
          CARD_SURFACE_CLASS,
          "flex w-full max-w-md flex-col items-center px-8 py-12 text-center",
        )}
      >
        <BwipoWordmark />
        <p className="mt-6 max-w-xs text-sm leading-relaxed text-muted-foreground">
          Selecione uma conversa para ver mensagens, ligações e o histórico do
          time.
        </p>
      </div>
    </div>
  );
}
