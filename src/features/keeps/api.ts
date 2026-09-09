import { apiUrl, parseApiResponse } from "@/lib/api";
import type { KeepDoc, KeepFolder, KeepNote } from "./types";

async function json<T>(res: Promise<Response>, fallback: string): Promise<T> {
  return parseApiResponse<T>(await res, fallback);
}

export async function listKeepNotes(folder: KeepFolder, q: string): Promise<{ items: KeepNote[] }> {
  const params = new URLSearchParams({ folder });
  if (q.trim()) params.set("q", q.trim());
  return json(fetch(apiUrl(`/api/keeps?${params}`), { credentials: "include" }), "Não foi possível carregar as notas.");
}

export async function createKeepNote(input: { title?: string; content?: KeepDoc }): Promise<{ note: KeepNote }> {
  return json(
    fetch(apiUrl("/api/keeps"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Não foi possível criar a nota.",
  );
}

export async function patchKeepNote(
  id: string,
  patch: Partial<{ title: string; content: KeepDoc; pinned: boolean; archived: boolean; trashed: boolean }>,
): Promise<{ note: KeepNote }> {
  return json(
    fetch(apiUrl(`/api/keeps/${id}`), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }),
    "Não foi possível atualizar a nota.",
  );
}

export async function deleteKeepNote(id: string, forever = false): Promise<void> {
  const qs = forever ? "?forever=1" : "";
  await parseApiResponse(
    await fetch(apiUrl(`/api/keeps/${id}${qs}`), { method: "DELETE", credentials: "include" }),
    "Não foi possível excluir a nota.",
  );
}

export async function uploadKeepAttachment(noteId: string, file: File): Promise<{ attachment: KeepNote["attachments"][number] }> {
  const form = new FormData();
  form.append("file", file);
  return json(
    fetch(apiUrl(`/api/keeps/${noteId}/attachments`), {
      method: "POST",
      credentials: "include",
      body: form,
    }),
    "Não foi possível enviar o anexo.",
  );
}

export async function importGoogleKeepZip(file: File): Promise<{ imported: number; batchId: string }> {
  const form = new FormData();
  form.append("file", file);
  return json(
    fetch(apiUrl("/api/keeps/import"), {
      method: "POST",
      credentials: "include",
      body: form,
    }),
    "Não foi possível importar o ZIP.",
  );
}

export async function reorderKeepNotes(
  items: Array<{ id: string; pinned: boolean; position: number }>,
): Promise<void> {
  await parseApiResponse(
    await fetch(apiUrl("/api/keeps/reorder"), {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    }),
    "Não foi possível reordenar as notas.",
  );
}
