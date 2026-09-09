import { apiFetch, parseApiResponse } from "@/lib/api";
import type {
  RecordSearchHit,
  TeamChatAttachment,
  TeamChatDepartment,
  TeamChatMessage,
  TeamChatNote,
  TeamChatPerson,
  TeamChatRoom,
  WorkItem,
  WorkItemEntryInput,
  WorkItemType,
} from "./types";

async function json<T>(res: Promise<Response>, fallback: string): Promise<T> {
  return parseApiResponse<T>(await res, fallback);
}

export async function listTeamChatRooms(): Promise<{ rooms: TeamChatRoom[] }> {
  return json(apiFetch("/api/team-chat/rooms"), "Não foi possível carregar o chat.");
}

export async function createTeamChatRoom(input: {
  memberIds: string[];
  name?: string;
  topic?: string;
}): Promise<{ room: TeamChatRoom; created: boolean }> {
  return json(
    apiFetch("/api/team-chat/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível abrir a conversa.",
  );
}

export async function listTeamChatMessages(roomId: string): Promise<{ messages: TeamChatMessage[] }> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/messages`),
    "Não foi possível carregar as mensagens.",
  );
}

export async function pingTeamChatTyping(roomId: string): Promise<void> {
  try {
    await apiFetch(`/api/team-chat/rooms/${roomId}/typing`, { method: "POST" }, 4_000);
  } catch {
    /* indicador é best-effort */
  }
}

export async function sendTeamChatMessage(
  roomId: string,
  input: { content?: string; attachments?: TeamChatAttachment[] },
): Promise<TeamChatMessage> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível enviar a mensagem.",
  );
}

export async function uploadTeamChatAttachment(
  roomId: string,
  file: File | Blob,
  options?: { fileName?: string; asSticker?: boolean },
): Promise<TeamChatAttachment> {
  const form = new FormData();
  form.append("file", file, options?.fileName ?? (file instanceof File ? file.name : "arquivo.bin"));
  if (options?.asSticker) form.append("sticker", "1");
  const data = await json<{ attachment: TeamChatAttachment }>(
    apiFetch(`/api/team-chat/rooms/${roomId}/attachments`, {
      method: "POST",
      body: form,
    }, 60_000),
    "Não foi possível enviar o anexo.",
  );
  return data.attachment;
}

export async function addTeamChatMembers(roomId: string, memberIds: string[]): Promise<TeamChatRoom> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberIds }),
    }),
    "Não foi possível adicionar membros.",
  );
}

export async function listTeamChatColleagues(): Promise<{
  colleagues: TeamChatPerson[];
  departments: TeamChatDepartment[];
}> {
  return json(apiFetch("/api/team-chat/colleagues"), "Não foi possível carregar a equipe.");
}

export async function reactTeamChatMessage(
  roomId: string,
  messageId: string,
  emoji: string,
): Promise<TeamChatMessage> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/messages/${messageId}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    }),
    "Não foi possível reagir.",
  );
}

export async function pinTeamChatMessage(roomId: string, messageId: string): Promise<TeamChatMessage> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/messages/${messageId}/pin`, { method: "POST" }),
    "Não foi possível fixar a mensagem.",
  );
}

export async function listTeamChatNotes(roomId: string): Promise<{ notes: TeamChatNote[] }> {
  return json(apiFetch(`/api/team-chat/rooms/${roomId}/notes`), "Não foi possível carregar as notas.");
}

export async function addTeamChatNote(roomId: string, content: string): Promise<TeamChatNote> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    }),
    "Não foi possível salvar a nota.",
  );
}

export async function pinTeamChatNote(noteId: string): Promise<TeamChatNote> {
  return json(
    apiFetch(`/api/team-chat/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pin" }),
    }),
    "Não foi possível fixar a nota.",
  );
}

export async function deleteTeamChatNote(noteId: string): Promise<{ ok: boolean }> {
  return json(
    apiFetch(`/api/team-chat/notes/${noteId}`, { method: "DELETE" }),
    "Não foi possível excluir a nota.",
  );
}

export async function listRoomWorkItems(roomId: string): Promise<{ items: WorkItem[] }> {
  return json(
    apiFetch(`/api/team-chat/work-items?roomId=${encodeURIComponent(roomId)}`),
    "Não foi possível carregar os checklists.",
  );
}

export async function listMyWorkItems(): Promise<{ items: WorkItem[] }> {
  return json(apiFetch("/api/team-chat/work-items/mine"), "Não foi possível carregar as pendências.");
}

export async function createTeamChatWorkItem(input: {
  type: WorkItemType;
  title: string;
  originType: "room" | "meeting" | "message";
  originId: string;
  roomId?: string | null;
  visibility?: "canal" | "privado" | "participantes";
  anchor?: { type: string; id: string } | null;
  entries?: WorkItemEntryInput[];
  startsAt?: string | null;
  endsAt?: string | null;
  callUrl?: string | null;
  recurrenceKey?: string | null;
  participantIds?: string[];
  postMessage?: boolean;
}): Promise<WorkItem> {
  return json(
    apiFetch("/api/team-chat/work-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível criar o item.",
  );
}

export async function updateTeamChatWorkItem(
  id: string,
  input: {
    title?: string;
    anchor?: { type: string; id: string } | null;
    startsAt?: string | null;
    endsAt?: string | null;
    callUrl?: string | null;
    participantIds?: string[];
  },
): Promise<WorkItem> {
  return json(
    apiFetch(`/api/team-chat/work-items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível atualizar o item.",
  );
}

export async function addWorkItemEntry(id: string, input: WorkItemEntryInput): Promise<WorkItem> {
  return json(
    apiFetch(`/api/team-chat/work-items/${id}/entries`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível adicionar o item.",
  );
}

export async function updateWorkItemEntry(
  id: string,
  entryId: string,
  input: {
    text?: string;
    assigneeId?: string | null;
    dueAt?: string | null;
    status?: "open" | "done";
  },
): Promise<WorkItem> {
  return json(
    apiFetch(`/api/team-chat/work-items/${id}/entries/${entryId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível atualizar o item.",
  );
}

export async function extractWorkItemEntries(
  text: string,
): Promise<{ title: string; entries: WorkItemEntryInput[] }> {
  return json(
    apiFetch("/api/team-chat/work-items/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
    "Não foi possível extrair os itens.",
  );
}

export async function generateChecklistFromMeeting(id: string): Promise<WorkItem> {
  return json(
    apiFetch(`/api/team-chat/work-items/${id}/generate-checklist`, { method: "POST" }),
    "Não foi possível gerar o checklist.",
  );
}

export async function messageToChecklist(
  roomId: string,
  messageId: string,
  input: {
    title?: string;
    entries?: WorkItemEntryInput[];
    anchor?: { type: string; id: string } | null;
  } = {},
): Promise<WorkItem> {
  return json(
    apiFetch(`/api/team-chat/rooms/${roomId}/messages/${messageId}/to-checklist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível criar o checklist.",
  );
}

export async function searchTeamChatRecords(q: string): Promise<{ records: RecordSearchHit[] }> {
  return json(
    apiFetch(`/api/team-chat/records/search?q=${encodeURIComponent(q)}`),
    "Não foi possível buscar registros.",
  );
}
