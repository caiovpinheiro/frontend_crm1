"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { BwipoWordmark } from "@/components/bwipo/bwipo-logo";
import { AppLoading } from "@/components/crm/app-loading";
import { CARD_SURFACE_CLASS } from "@/components/crm/sortable-header";
import { useNavMessageAlerts } from "@/components/layout/nav-message-alerts";
import { cn } from "@/lib/utils";

import { ChatHeader } from "./chat-header";
import { AddMembersDialog, ComposeDialog } from "./compose-dialogs";
import { Composer } from "./composer";
import { DetailsPanel } from "./details-panel";
import { ForwardDialog } from "./forward-dialog";
import { MessageList } from "./message-list";
import { Sidebar } from "./sidebar";
import {
  markRoomReadInCache,
  patchRoomWorkItem,
  removeRoomWorkItem,
  usePingTeamChatTyping,
  useOrbitaArchived,
  useOrbitaFavorites,
  useRoomWorkItems,
  useTeamChatColleagues,
  useTeamChatMessages,
  useTeamChatMutations,
  useTeamChatNotes,
  useTeamChatRealtime,
  useTeamChatRooms,
  useTeamChatTyping,
} from "./hooks";
import { favoriteKey, isGroupRoom, parseQuotedContent } from "./helpers";
import type { DirectRow, OpenCrmCard, TeamChatMessage, TeamChatRoom, WorkItem, WorkItemType } from "./types";
import {
  CreateWorkItemDialog,
  LinkRecordDialog,
  MessageToChecklistDialog,
} from "./work-item-dialogs";

export function TeamChatApp() {
  const { data: session, status } = useSession();
  const meId = (session?.user as { id?: string } | undefined)?.id ?? "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeIntent, setComposeIntent] = useState<"dm" | "group">("dm");
  const [addOpen, setAddOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const qc = useQueryClient();

  const ready = status !== "unauthenticated";
  const roomsQuery = useTeamChatRooms(ready, selectedId);
  const peopleQuery = useTeamChatColleagues(ready);
  const { favorites, toggleFavorite } = useOrbitaFavorites();
  const { archived, toggleArchived } = useOrbitaArchived();
  const { createRoom, setRoomMuted, leaveRoom, removeRoom } = useTeamChatMutations();
  const typing = useTeamChatTyping(meId, ready);
  const rooms = roomsQuery.data?.rooms ?? [];
  const colleagues = peopleQuery.data?.colleagues ?? [];
  useTeamChatRealtime(selectedId, ready);
  const { setActiveTeamChatRoom } = useNavMessageAlerts();
  useEffect(() => {
    setActiveTeamChatRoom(selectedId);
    return () => setActiveTeamChatRoom(null);
  }, [selectedId, setActiveTeamChatRoom]);
  const knownRoomIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const ids = new Set((roomsQuery.data?.rooms ?? []).map((r) => r.id));
    if (selectedId && knownRoomIds.current.has(selectedId) && !ids.has(selectedId)) {
      setSelectedId(null);
      setAddOpen(false);
      setDetailsOpen(false);
    }
    if (roomsQuery.data) knownRoomIds.current = ids;
  }, [selectedId, roomsQuery.data]);

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

  const groups = rooms.filter((r) => isGroupRoom(r));
  const selected = rooms.find((r) => r.id === selectedId) ?? null;
  const notesQuery = useTeamChatNotes(selectedId, detailsOpen || !!selectedId);
  const notes = notesQuery.data?.notes ?? [];
  const roomWorkItemsQuery = useRoomWorkItems(selectedId, !!selectedId);
  const roomWorkItems = roomWorkItemsQuery.data?.items ?? [];
  const openEntryCount = roomWorkItems.reduce(
    (n, item) => n + item.entries.filter((entry) => entry.status === "open").length,
    0,
  );
  const detailsBadge = openEntryCount + notes.length;

  function openPerson(personId: string) {
    const existing = rooms.find((r) => r.kind === "DM" && r.peer?.id === personId);
    if (existing) {
      setSelectedId(existing.id);
      markRoomReadInCache(qc, existing.id);
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
          "orbita-block flex h-full min-h-0 w-full shrink-0 flex-col md:w-[min(38%,28rem)] md:min-w-[26rem] md:max-w-[32rem]",
          selected ? "hidden md:flex" : "flex",
        )}
      >
        <Sidebar
          directs={directs}
          groups={groups}
          activeId={selectedId}
          loading={listBootstrapping}
          error={directs.length === 0 && groups.length === 0 ? loadError : null}
          favorites={favorites}
          archived={archived}
          onToggleFavorite={toggleFavorite}
          onToggleArchived={toggleArchived}
          onToggleMute={(roomId, muted) =>
            setRoomMuted.mutate(
              { roomId, muted: !muted },
              { onError: (e: Error) => toast.error(e.message) },
            )
          }
          onSelectRoom={(id) => {
            setSelectedId(id);
            markRoomReadInCache(qc, id);
            setDetailsOpen(false);
          }}
          onSelectPerson={(id) => {
            setDetailsOpen(false);
            openPerson(id);
          }}
          onNew={() => {
            setComposeIntent("dm");
            setComposeOpen(true);
          }}
          onNewGroup={() => {
            setComposeIntent("group");
            setComposeOpen(true);
          }}
          typing={typing}
        />
      </div>

      <section
        data-tour="bwipo-chat-stage"
        className={cn(
          // orbita-block--float: overflow visible p/ menus do composer (+ / emoji) abrirem acima
          "orbita-block orbita-block--float relative flex h-full min-h-0 min-w-0 flex-1 flex-col",
          selected ? "flex" : "hidden md:flex",
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
            detailsOpen={detailsOpen}
            detailsBadge={detailsBadge}
            typing={typing[selected.id] ?? null}
            favorited={favorites.includes(
              favoriteKey({ roomId: selected.id, personId: selected.peer?.id }),
            )}
            onBack={() => setSelectedId(null)}
            onToggleDetails={() => setDetailsOpen((v) => !v)}
            onToggleFavorite={() =>
              toggleFavorite(favoriteKey({ roomId: selected.id, personId: selected.peer?.id }))
            }
            onAddMembers={() => setAddOpen(true)}
          />
        ) : (
          <LandingEmpty />
        )}
      </section>

      {selected && detailsOpen && (
        <>
          <div className="orbita-block hidden h-full w-[320px] shrink-0 md:block">
            <DetailsHost
              room={selected}
              roomId={selected.id}
              meId={meId}
              notes={notes}
              workItems={roomWorkItems}
              favorited={favorites.includes(
                favoriteKey({ roomId: selected.id, personId: selected.peer?.id }),
              )}
              onToggleFavorite={() =>
                toggleFavorite(favoriteKey({ roomId: selected.id, personId: selected.peer?.id }))
              }
              onToggleMute={() =>
                setRoomMuted.mutate(
                  { roomId: selected.id, muted: !selected.muted },
                  { onError: (e: Error) => toast.error(e.message) },
                )
              }
              onLeave={() =>
                leaveRoom.mutate(selected.id, {
                  onSuccess: () => {
                    setSelectedId(null);
                    setDetailsOpen(false);
                    toast.success("Você saiu do grupo.");
                  },
                  onError: (e: Error) => toast.error(e.message),
                })
              }
              onDeleteGroup={() =>
                removeRoom.mutate(selected.id, {
                  onSuccess: () => {
                    setSelectedId(null);
                    setDetailsOpen(false);
                    toast.success("Grupo excluído.");
                  },
                  onError: (e: Error) => toast.error(e.message),
                })
              }
              onAddMembers={() => setAddOpen(true)}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
          <div className="absolute inset-0 z-20 md:hidden">
            <DetailsHost
              room={selected}
              roomId={selected.id}
              meId={meId}
              notes={notes}
              workItems={roomWorkItems}
              favorited={favorites.includes(
                favoriteKey({ roomId: selected.id, personId: selected.peer?.id }),
              )}
              onToggleFavorite={() =>
                toggleFavorite(favoriteKey({ roomId: selected.id, personId: selected.peer?.id }))
              }
              onToggleMute={() =>
                setRoomMuted.mutate(
                  { roomId: selected.id, muted: !selected.muted },
                  { onError: (e: Error) => toast.error(e.message) },
                )
              }
              onLeave={() =>
                leaveRoom.mutate(selected.id, {
                  onSuccess: () => {
                    setSelectedId(null);
                    setDetailsOpen(false);
                    toast.success("Você saiu do grupo.");
                  },
                  onError: (e: Error) => toast.error(e.message),
                })
              }
              onDeleteGroup={() =>
                removeRoom.mutate(selected.id, {
                  onSuccess: () => {
                    setSelectedId(null);
                    setDetailsOpen(false);
                    toast.success("Grupo excluído.");
                  },
                  onError: (e: Error) => toast.error(e.message),
                })
              }
              onAddMembers={() => setAddOpen(true)}
              onClose={() => setDetailsOpen(false)}
            />
          </div>
        </>
      )}

      <ComposeDialog
        open={composeOpen}
        onOpenChange={setComposeOpen}
        meId={meId}
        intent={composeIntent}
        onCreated={(id) => {
          setSelectedId(id);
          setComposeOpen(false);
          if (composeIntent === "group") setAddOpen(true);
        }}
      />
      {selected && isGroupRoom(selected) && (
        <AddMembersDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          room={selected}
          meId={meId}
          onDeleted={(id) => {
            setAddOpen(false);
            setSelectedId((cur) => (cur === id ? null : cur));
            setDetailsOpen(false);
          }}
        />
      )}
    </div>
  );
}

function DetailsHost({
  room,
  roomId,
  meId,
  notes,
  workItems,
  favorited,
  onToggleFavorite,
  onToggleMute,
  onLeave,
  onDeleteGroup,
  onAddMembers,
  onClose,
}: {
  room: TeamChatRoom;
  roomId: string;
  meId: string;
  notes: { id: string; text: string; pinned: boolean; createdAt: string }[];
  workItems: WorkItem[];
  favorited: boolean;
  onToggleFavorite: () => void;
  onToggleMute: () => void;
  onLeave: () => void;
  onDeleteGroup: () => void;
  onAddMembers: () => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { addNote, toggleNotePin, removeNote } = useTeamChatMutations();
  return (
    <DetailsPanel
      room={room}
      roomId={roomId}
      meId={meId}
      notes={notes}
      workItems={workItems}
      favorited={favorited}
      onToggleFavorite={onToggleFavorite}
      onToggleMute={onToggleMute}
      onLeave={isGroupRoom(room) ? onLeave : undefined}
      onDeleteGroup={isGroupRoom(room) ? onDeleteGroup : undefined}
      onAddMembers={isGroupRoom(room) ? onAddMembers : undefined}
      onAddNote={(text) =>
        addNote.mutate({ roomId, content: text }, { onError: (e: Error) => toast.error(e.message) })
      }
      onToggleNotePin={(id) =>
        toggleNotePin.mutate({ noteId: id, roomId }, { onError: (e: Error) => toast.error(e.message) })
      }
      onDeleteNote={(id) =>
        removeNote.mutate({ noteId: id, roomId }, { onError: (e: Error) => toast.error(e.message) })
      }
      onWorkItemChange={(item) => patchRoomWorkItem(qc, item)}
      onWorkItemDeleted={(id) => removeRoomWorkItem(qc, roomId, id)}
      onClose={onClose}
    />
  );
}

function Thread({
  room,
  meId,
  detailsOpen,
  detailsBadge,
  typing,
  favorited,
  onBack,
  onToggleDetails,
  onToggleFavorite,
  onAddMembers,
}: {
  room: TeamChatRoom;
  meId: string;
  detailsOpen: boolean;
  detailsBadge: number;
  typing?: { userId: string; name: string } | null;
  favorited: boolean;
  onBack: () => void;
  onToggleDetails: () => void;
  onToggleFavorite: () => void;
  onAddMembers: () => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const { data, isError, error, refetch } = useTeamChatMessages(room.id);
  const workItemsQuery = useRoomWorkItems(room.id);
  const { send, react, pin, removeMessage } = useTeamChatMutations();
  const messages = data?.messages ?? [];
  const workItems = workItemsQuery.data?.items ?? [];
  const messagesError =
    error instanceof Error ? error.message : isError ? "Não foi possível carregar as mensagens." : null;
  const [chatQuery, setChatQuery] = useState("");
  const [quote, setQuote] = useState<{ author: string; text: string } | null>(null);
  const [createType, setCreateType] = useState<WorkItemType | null>(null);
  const [toChecklist, setToChecklist] = useState<TeamChatMessage | null>(null);
  const [linkItemId, setLinkItemId] = useState<string | null>(null);
  const [forwardMsg, setForwardMsg] = useState<TeamChatMessage | null>(null);
  const pingTyping = usePingTeamChatTyping(room.id);

  useEffect(() => {
    setChatQuery("");
    setQuote(null);
    setCreateType(null);
    setToChecklist(null);
    setLinkItemId(null);
    setForwardMsg(null);
  }, [room.id]);

  function onWorkItemReady(item: WorkItem) {
    patchRoomWorkItem(qc, item);
    void qc.invalidateQueries({ queryKey: ["team-chat-messages", room.id] });
    void qc.invalidateQueries({ queryKey: ["team-chat-rooms"] });
  }

  function openCrmRecord(card: OpenCrmCard) {
    router.push(card.href);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div data-tour="bwipo-chat-header">
        <ChatHeader
          room={room}
          detailsOpen={detailsOpen}
          detailsBadge={detailsBadge}
          searchQuery={chatQuery}
          favorited={favorited}
          typing={typing}
          onSearchChange={setChatQuery}
          onBack={onBack}
          onToggleDetails={onToggleDetails}
          onToggleFavorite={onToggleFavorite}
          onAddMembers={onAddMembers}
        />
      </div>
      <div className="chat-thread-texture relative flex min-h-0 flex-1 flex-col overflow-x-hidden" data-wa-thread data-tour="bwipo-chat-messages">
        <MessageList
          room={room}
          messages={messages}
          meId={meId}
          error={messagesError}
          onRetry={() => {
            void refetch();
          }}
          query={chatQuery}
          workItems={workItems}
          onToggleReaction={(id, emoji) =>
            react.mutate({ roomId: room.id, messageId: id, emoji }, { onError: (e: Error) => toast.error(e.message) })
          }
          onTogglePin={(id) =>
            pin.mutate({ roomId: room.id, messageId: id }, { onError: (e: Error) => toast.error(e.message) })
          }
          onReply={(msg) => {
            const parsed = parseQuotedContent(msg.content);
            setQuote({
              author: msg.author?.name ?? "Colega",
              text:
                parsed.body.trim() ||
                parsed.quote?.excerpt ||
                msg.attachments?.[0]?.name ||
                "Anexo",
            });
          }}
          onWorkItemChange={onWorkItemReady}
          onWorkItemDeleted={(id) => removeRoomWorkItem(qc, room.id, id)}
          onLinkRecord={(item) => setLinkItemId(item.id)}
          onToChecklist={(msg) => setToChecklist(msg)}
          onForward={(msg) => setForwardMsg(msg)}
          onDelete={(msg) =>
            removeMessage.mutate(
              { roomId: room.id, messageId: msg.id },
              { onError: (e: Error) => toast.error(e.message) },
            )
          }
          onOpenRecord={openCrmRecord}
        />
        <div className="relative z-20 shrink-0 overflow-visible border-t border-[var(--orbita-divider)] bg-[var(--orbita-chrome)] px-2 py-2 md:px-3" data-tour="bwipo-chat-composer">
          <div className="w-full overflow-visible">
            <Composer
              roomId={room.id}
              mentionPeople={room.members}
              placeholder="Digite uma mensagem"
              quote={quote}
              onTyping={pingTyping}
              onClearQuote={() => setQuote(null)}
              onCreateWorkItem={(type) => setCreateType(type)}
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
      <CreateWorkItemDialog
        open={createType !== null}
        onOpenChange={(v) => {
          if (!v) setCreateType(null);
        }}
        roomId={room.id}
        type={createType ?? "checklist"}
        onCreated={onWorkItemReady}
      />
      <MessageToChecklistDialog
        open={toChecklist !== null}
        onOpenChange={(v) => {
          if (!v) setToChecklist(null);
        }}
        roomId={room.id}
        messageId={toChecklist?.id ?? ""}
        seedText={toChecklist?.content ?? ""}
        onCreated={onWorkItemReady}
      />
      <LinkRecordDialog
        open={linkItemId !== null}
        onOpenChange={(v) => {
          if (!v) setLinkItemId(null);
        }}
        workItemId={linkItemId}
        onLinked={onWorkItemReady}
      />
      <ForwardDialog
        open={forwardMsg !== null}
        onOpenChange={(v) => {
          if (!v) setForwardMsg(null);
        }}
        roomId={room.id}
        message={forwardMsg}
      />
    </div>
  );
}

function LandingEmpty() {
  return (
    <div
      className="chat-thread-texture flex flex-1 flex-col items-center justify-center px-6"
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
