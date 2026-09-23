"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

import { subscribeSSEEvents } from "@/hooks/use-sse";
import { useMessageToast } from "@/features/inbox-v2/context/message-toast-context";
import { ApiError } from "@/lib/api";
import {
  addTeamChatMembers,
  addTeamChatNote,
  createTeamChatRoom,
  deleteTeamChatMessage,
  deleteTeamChatNote,
  deleteTeamChatRoom,
  leaveTeamChatRoom,
  listMyWorkItems,
  listRoomWorkItems,
  listTeamChatColleagues,
  listTeamChatMessages,
  listTeamChatNotes,
  listTeamChatRooms,
  pinTeamChatMessage,
  pingTeamChatTyping,
  pinTeamChatNote,
  reactTeamChatMessage,
  sendTeamChatMessage,
  updateTeamChatRoom,
  updateTeamChatRoomPrefs,
} from "./api";
import { loadOrbitaArchived, loadOrbitaFavorites, saveOrbitaArchived, saveOrbitaFavorites } from "./helpers";
import type { TeamChatAttachment, TeamChatMessage, TeamChatNote, TeamChatRoom, WorkItem } from "./types";

export function useOrbitaFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(loadOrbitaFavorites());
  }, []);

  function toggleFavorite(id: string) {
    if (!id) return;
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveOrbitaFavorites(next);
      return next;
    });
  }

  return { favorites, toggleFavorite };
}

export function useOrbitaArchived() {
  const [archived, setArchived] = useState<string[]>([]);

  useEffect(() => {
    setArchived(loadOrbitaArchived());
  }, []);

  function toggleArchived(id: string) {
    if (!id) return;
    setArchived((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      saveOrbitaArchived(next);
      return next;
    });
  }

  return { archived, toggleArchived };
}

const ROOMS_KEY = "team-chat-rooms";
const MESSAGES_KEY = "team-chat-messages";
const PEOPLE_KEY = "team-chat-colleagues";
const NOTES_KEY = "team-chat-notes";
const MY_WORK_ITEMS_KEY = "team-chat-work-items-mine";
const ROOM_WORK_ITEMS_KEY = "team-chat-work-items";

export function incrementRoomUnreadInCache(
  qc: ReturnType<typeof useQueryClient>,
  roomId: string,
  preview?: string | null,
) {
  qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
    if (!prev) return prev;
    let found = false;
    const rooms = prev.rooms.map((r) => {
      if (r.id !== roomId) return r;
      found = true;
      return {
        ...r,
        unread: (r.unread || 0) + 1,
        lastPreview: preview?.trim() || r.lastPreview,
        lastMessageAt: new Date().toISOString(),
      };
    });
    return found ? { rooms } : prev;
  });
}

export function markRoomReadInCache(
  qc: ReturnType<typeof useQueryClient>,
  roomId: string,
) {
  qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
    if (!prev) return prev;
    let changed = false;
    const rooms = prev.rooms.map((r) => {
      if (r.id !== roomId || r.unread === 0) return r;
      changed = true;
      return { ...r, unread: 0 };
    });
    return changed ? { rooms } : prev;
  });
}

function mergeMessageLists(cached: TeamChatMessage[] | undefined, fetched: TeamChatMessage[]) {
  if (!cached?.length) return fetched;
  const byId = new Map(fetched.map((m) => [m.id, m]));
  const newest = fetched[fetched.length - 1]?.createdAt;
  for (const msg of cached) {
    if (byId.has(msg.id)) continue;
    if (newest && msg.createdAt >= newest) byId.set(msg.id, msg);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function upsertTeamChatMessage(
  qc: ReturnType<typeof useQueryClient>,
  msg: TeamChatMessage,
  roomId = msg.roomId,
) {
  if (!roomId || !msg.id) return;
  const nextMsg = { ...msg, roomId };
  qc.setQueryData<{ messages: TeamChatMessage[] }>([MESSAGES_KEY, roomId], (prev) => {
    const list = prev?.messages ?? [];
    const idx = list.findIndex((m) => m.id === nextMsg.id);
    if (idx === -1) return { messages: [...list, nextMsg] };
    const next = [...list];
    next[idx] = { ...next[idx], ...nextMsg };
    return { messages: next };
  });
}

function patchMessage(qc: ReturnType<typeof useQueryClient>, msg: TeamChatMessage) {
  upsertTeamChatMessage(qc, msg);
}

function retryUnlessTimeout(count: number, err: Error) {
  if (err instanceof ApiError && err.code === "FETCH_TIMEOUT") return false;
  return count < 2;
}

export function useTeamChatRooms(enabled = true, activeRoomId: string | null = null) {
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: [ROOMS_KEY],
    queryFn: listTeamChatRooms,
    enabled,
    refetchInterval: visible ? 120_000 : false,
    refetchIntervalInBackground: false,
    retry: retryUnlessTimeout,
    select: (data) => {
      if (!activeRoomId || !data.rooms.some((r) => r.id === activeRoomId && r.unread > 0)) {
        return data;
      }
      return {
        rooms: data.rooms.map((r) =>
          r.id === activeRoomId && r.unread > 0 ? { ...r, unread: 0 } : r,
        ),
      };
    },
  });
}

export function useTeamChatMessages(roomId: string | null) {
  const qc = useQueryClient();
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: [MESSAGES_KEY, roomId],
    queryFn: async () => {
      const data = await listTeamChatMessages(roomId as string);
      markRoomReadInCache(qc, roomId as string);
      const prev = qc.getQueryData<{ messages: TeamChatMessage[] }>([MESSAGES_KEY, roomId]);
      return { messages: mergeMessageLists(prev?.messages, data.messages) };
    },
    enabled: !!roomId,
    refetchOnMount: "always",
    refetchInterval: visible ? 8_000 : false,
    refetchIntervalInBackground: false,
    retry: retryUnlessTimeout,
  });
}

export function useTeamChatColleagues(enabled = true) {
  return useQuery({
    queryKey: [PEOPLE_KEY],
    queryFn: listTeamChatColleagues,
    enabled,
    staleTime: 15_000,
    retry: retryUnlessTimeout,
  });
}

export function useTeamChatNotes(roomId: string | null, enabled = true) {
  return useQuery({
    queryKey: [NOTES_KEY, roomId],
    queryFn: () => listTeamChatNotes(roomId as string),
    enabled: !!roomId && enabled,
    retry: retryUnlessTimeout,
  });
}

export function useMyWorkItems(enabled = true) {
  return useQuery({
    queryKey: [MY_WORK_ITEMS_KEY],
    queryFn: listMyWorkItems,
    enabled,
    retry: retryUnlessTimeout,
  });
}

export function useRoomWorkItems(roomId: string | null, enabled = true) {
  return useQuery({
    queryKey: [ROOM_WORK_ITEMS_KEY, roomId],
    queryFn: () => listRoomWorkItems(roomId as string),
    enabled: !!roomId && enabled,
    retry: retryUnlessTimeout,
  });
}

export function removeRoomWorkItem(
  qc: ReturnType<typeof useQueryClient>,
  roomId: string | null,
  itemId: string,
) {
  qc.setQueryData<{ items: WorkItem[] }>([ROOM_WORK_ITEMS_KEY, roomId], (prev) => {
    if (!prev) return prev;
    return { items: prev.items.filter((w) => w.id !== itemId) };
  });
  qc.invalidateQueries({ queryKey: [MY_WORK_ITEMS_KEY] });
  if (roomId) qc.invalidateQueries({ queryKey: [MESSAGES_KEY, roomId] });
}

export function patchRoomWorkItem(qc: ReturnType<typeof useQueryClient>, item: WorkItem) {
  qc.setQueryData<{ items: WorkItem[] }>([ROOM_WORK_ITEMS_KEY, item.roomId], (prev) => {
    if (!prev) return { items: [item] };
    const idx = prev.items.findIndex((w) => w.id === item.id);
    if (idx === -1) return { items: [item, ...prev.items] };
    const items = [...prev.items];
    items[idx] = item;
    return { items };
  });
  qc.invalidateQueries({ queryKey: [MY_WORK_ITEMS_KEY] });
}

export function useTeamChatMutations() {
  const qc = useQueryClient();
  const createRoom = useMutation({
    mutationFn: createTeamChatRoom,
    onSuccess: () => qc.invalidateQueries({ queryKey: [ROOMS_KEY] }),
  });
  const send = useMutation({
    mutationFn: ({
      roomId,
      content,
      attachments,
    }: {
      roomId: string;
      content?: string;
      attachments?: TeamChatAttachment[];
    }) => sendTeamChatMessage(roomId, { content, attachments }),
    onSuccess: (msg) => {
      patchMessage(qc, msg);
      qc.invalidateQueries({ queryKey: [ROOMS_KEY] });
    },
  });
  const addMembers = useMutation({
    mutationFn: ({ roomId, memberIds }: { roomId: string; memberIds: string[] }) =>
      addTeamChatMembers(roomId, memberIds),
    onSuccess: (_room, vars) => {
      qc.invalidateQueries({ queryKey: [ROOMS_KEY] });
      qc.invalidateQueries({ queryKey: [MESSAGES_KEY, vars.roomId] });
    },
  });
  const updateRoom = useMutation({
    mutationFn: ({
      roomId,
      ...input
    }: {
      roomId: string;
      avatarUrl?: string | null;
      name?: string;
      topic?: string | null;
    }) => updateTeamChatRoom(roomId, input),
    onSuccess: (room) => {
      qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
        if (!prev) return prev;
        return { rooms: prev.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r)) };
      });
      qc.invalidateQueries({ queryKey: [ROOMS_KEY] });
    },
  });
  const setRoomMuted = useMutation({
    mutationFn: ({ roomId, muted }: { roomId: string; muted: boolean }) =>
      updateTeamChatRoomPrefs(roomId, { muted }),
    onSuccess: (room) => {
      qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
        if (!prev) return prev;
        return { rooms: prev.rooms.map((r) => (r.id === room.id ? { ...r, ...room } : r)) };
      });
    },
  });
  const leaveRoom = useMutation({
    mutationFn: (roomId: string) => leaveTeamChatRoom(roomId),
    onSuccess: (_ok, roomId) => {
      qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
        if (!prev) return prev;
        return { rooms: prev.rooms.filter((r) => r.id !== roomId) };
      });
      qc.removeQueries({ queryKey: [MESSAGES_KEY, roomId] });
    },
  });
  const removeMessage = useMutation({
    mutationFn: ({ roomId, messageId }: { roomId: string; messageId: string }) =>
      deleteTeamChatMessage(roomId, messageId),
    onSuccess: (_ok, vars) => {
      qc.setQueryData<{ messages: TeamChatMessage[] }>([MESSAGES_KEY, vars.roomId], (prev) => {
        if (!prev) return prev;
        return { messages: prev.messages.filter((m) => m.id !== vars.messageId) };
      });
      qc.invalidateQueries({ queryKey: [ROOMS_KEY] });
    },
  });
  const removeRoom = useMutation({
    mutationFn: (roomId: string) => deleteTeamChatRoom(roomId),
    onSuccess: (_ok, roomId) => {
      qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
        if (!prev) return prev;
        return { rooms: prev.rooms.filter((r) => r.id !== roomId) };
      });
      qc.removeQueries({ queryKey: [MESSAGES_KEY, roomId] });
      qc.removeQueries({ queryKey: [NOTES_KEY, roomId] });
      qc.removeQueries({ queryKey: [ROOM_WORK_ITEMS_KEY, roomId] });
      qc.invalidateQueries({ queryKey: [ROOMS_KEY] });
      qc.invalidateQueries({ queryKey: [MY_WORK_ITEMS_KEY] });
    },
  });
  const react = useMutation({
    mutationFn: ({ roomId, messageId, emoji }: { roomId: string; messageId: string; emoji: string }) =>
      reactTeamChatMessage(roomId, messageId, emoji),
    onSuccess: (msg) => patchMessage(qc, msg),
  });
  const pin = useMutation({
    mutationFn: ({ roomId, messageId }: { roomId: string; messageId: string }) =>
      pinTeamChatMessage(roomId, messageId),
    onSuccess: (msg) => patchMessage(qc, msg),
  });
  const addNote = useMutation({
    mutationFn: ({ roomId, content }: { roomId: string; content: string }) =>
      addTeamChatNote(roomId, content),
    onSuccess: (note, vars) => {
      qc.setQueryData<{ notes: TeamChatNote[] }>([NOTES_KEY, vars.roomId], (prev) => ({
        notes: [note, ...(prev?.notes ?? [])],
      }));
    },
  });
  const toggleNotePin = useMutation({
    mutationFn: ({ noteId }: { noteId: string; roomId: string }) => pinTeamChatNote(noteId),
    onSuccess: (note, vars) => {
      qc.setQueryData<{ notes: TeamChatNote[] }>([NOTES_KEY, vars.roomId], (prev) => ({
        notes: (prev?.notes ?? []).map((n) => (n.id === note.id ? note : n)),
      }));
    },
  });
  const removeNote = useMutation({
    mutationFn: ({ noteId }: { noteId: string; roomId: string }) => deleteTeamChatNote(noteId),
    onSuccess: (_ok, vars) => {
      qc.setQueryData<{ notes: TeamChatNote[] }>([NOTES_KEY, vars.roomId], (prev) => ({
        notes: (prev?.notes ?? []).filter((n) => n.id !== vars.noteId),
      }));
    },
  });
  return {
    createRoom,
    send,
    addMembers,
    updateRoom,
    setRoomMuted,
    leaveRoom,
    removeMessage,
    removeRoom,
    react,
    pin,
    addNote,
    toggleNotePin,
    removeNote,
  };
}

export type TeamChatTypingMap = Record<string, { userId: string; name: string }>;

export function useTeamChatTyping(meId: string, enabled = true) {
  const [typing, setTyping] = useState<TeamChatTypingMap>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (!enabled) return;
    function clearRoom(roomId: string) {
      if (timers.current[roomId]) {
        clearTimeout(timers.current[roomId]);
        delete timers.current[roomId];
      }
      setTyping((prev) => {
        if (!prev[roomId]) return prev;
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
    }
    return subscribeSSEEvents("/api/sse/messages", {
      team_chat_typing: (raw) => {
        const data = raw as { roomId?: string; userId?: string; name?: string };
        if (!data.roomId || !data.userId || data.userId === meId) return;
        setTyping((prev) => ({
          ...prev,
          [data.roomId!]: { userId: data.userId!, name: data.name || "Colega" },
        }));
        if (timers.current[data.roomId]) clearTimeout(timers.current[data.roomId]);
        timers.current[data.roomId] = setTimeout(() => clearRoom(data.roomId!), 3500);
      },
      team_chat_message: (raw) => {
        const data = raw as { roomId?: string };
        if (data.roomId) clearRoom(data.roomId);
      },
    });
  }, [enabled, meId]);

  useEffect(
    () => () => {
      Object.values(timers.current).forEach(clearTimeout);
    },
    [],
  );

  return typing;
}

export function usePingTeamChatTyping(roomId: string | null) {
  const last = useRef(0);
  return () => {
    if (!roomId) return;
    const now = Date.now();
    if (now - last.current < 1400) return;
    last.current = now;
    void pingTeamChatTyping(roomId);
  };
}

export function useTeamChatRealtime(
  activeRoomId: string | null,
  currentUserId?: string | null,
  enabled = true,
) {
  const qc = useQueryClient();
  const activeRef = useRef(activeRoomId);
  activeRef.current = activeRoomId;
  const { registerActiveTeamChatRoom, notifyTeamChatMessage } = useMessageToast();

  useEffect(() => {
    if (!activeRoomId) return;
    return registerActiveTeamChatRoom(activeRoomId);
  }, [registerActiveTeamChatRoom, activeRoomId]);

  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const bumpRooms = () => {
      const now = Date.now();
      if (now - last < 200) return;
      last = now;
      qc.invalidateQueries({ queryKey: [ROOMS_KEY] });
    };

    return subscribeSSEEvents("/api/sse/messages", {
      team_chat_room_updated: (raw) => {
        const data = raw as { roomId?: string; deleted?: boolean };
        if (data.deleted && data.roomId) {
          qc.setQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY], (prev) => {
            if (!prev) return prev;
            return { rooms: prev.rooms.filter((r) => r.id !== data.roomId) };
          });
          qc.removeQueries({ queryKey: [MESSAGES_KEY, data.roomId] });
          return;
        }
        bumpRooms();
      },
      team_chat_message: (raw) => {
        const data = raw as { roomId?: string; message?: TeamChatMessage; deleted?: boolean; messageId?: string };
        if (data.deleted && data.roomId && data.messageId) {
          qc.setQueryData<{ messages: TeamChatMessage[] }>([MESSAGES_KEY, data.roomId], (prev) => {
            if (!prev) return prev;
            return { messages: prev.messages.filter((m) => m.id !== data.messageId) };
          });
          bumpRooms();
          return;
        }
        const incoming = data.message
          ? { ...data.message, roomId: data.message.roomId || data.roomId || "" }
          : null;
        if (incoming?.id) upsertTeamChatMessage(qc, incoming);
        if (data.roomId && data.roomId === activeRef.current) {
          markRoomReadInCache(qc, data.roomId);
        } else if (data.roomId && !incoming?.id) {
          void qc.invalidateQueries({ queryKey: [MESSAGES_KEY, data.roomId] });
        }
        // Notificação toast para mensagens de outras salas do Bwipo Chat.
        if (
          data.roomId &&
          data.roomId !== activeRef.current &&
          incoming &&
          incoming.authorId &&
          incoming.authorId !== currentUserId &&
          incoming.kind !== "SYSTEM"
        ) {
          const roomsData = qc.getQueryData<{ rooms: TeamChatRoom[] }>([ROOMS_KEY]);
          const room = roomsData?.rooms.find((r) => r.id === data.roomId);
          notifyTeamChatMessage({
            roomId: data.roomId,
            roomName: room?.name ?? null,
            roomAvatarUrl: room?.avatarUrl ?? null,
            message: incoming,
          });
        }
        bumpRooms();
      },
      team_chat_work_item_updated: (raw) => {
        const data = raw as {
          roomId?: string;
          workItem?: WorkItem;
          deleted?: boolean;
          workItemId?: string;
        };
        if (data.deleted && data.workItemId) {
          removeRoomWorkItem(qc, data.roomId ?? null, data.workItemId);
          return;
        }
        if (data.workItem) patchRoomWorkItem(qc, data.workItem);
        else if (data.roomId) qc.invalidateQueries({ queryKey: [ROOM_WORK_ITEMS_KEY, data.roomId] });
        qc.invalidateQueries({ queryKey: [MY_WORK_ITEMS_KEY] });
      },
    });
  }, [qc, enabled]);
}
