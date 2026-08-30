import { apiFetch, parseApiResponse } from "@/lib/api";
import type {
  TeamChatAttachment,
  TeamChatDepartment,
  TeamChatMessage,
  TeamChatNote,
  TeamChatPerson,
  TeamChatRoom,
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
