import { apiUrl } from "@/lib/api";
import type { EmailDetail, EmailFolder, EmailListItem, EmailPagination } from "./types";

export async function listEmails(params: {
  accountId?: string;
  folder?: EmailFolder;
  customFolderId?: string;
  search?: string;
  unreadOnly?: boolean;
  page?: number;
  perPage?: number;
}): Promise<{ emails: EmailListItem[]; pagination: EmailPagination }> {
  const q = new URLSearchParams();
  if (params.accountId) q.set("accountId", params.accountId);
  if (params.folder) q.set("folder", params.folder);
  if (params.customFolderId) q.set("customFolderId", params.customFolderId);
  if (params.search?.trim()) q.set("q", params.search.trim());
  if (params.unreadOnly) q.set("unreadOnly", "1");
  if (params.page) q.set("page", String(params.page));
  if (params.perPage) q.set("perPage", String(params.perPage));

  const res = await fetch(apiUrl(`/api/emails?${q.toString()}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Erro ao listar e-mails.");
  return { emails: data.emails ?? [], pagination: data.pagination };
}

export async function getEmail(id: string): Promise<EmailDetail> {
  const res = await fetch(apiUrl(`/api/emails/${id}`));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Erro ao carregar e-mail.");
  return data.email as EmailDetail;
}

export async function markEmailRead(id: string, isRead: boolean): Promise<void> {
  await fetch(apiUrl(`/api/emails/${id}/read`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRead }),
  });
}

export async function moveEmail(
  id: string,
  input: { systemFolder?: EmailFolder; customFolderId?: string | null },
): Promise<void> {
  const res = await fetch(apiUrl(`/api/emails/${id}/move`), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Erro ao mover e-mail.");
  }
}

export async function deleteEmail(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/emails/${id}`), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message ?? "Erro ao excluir e-mail.");
  }
}

export async function sendEmail(params: {
  accountId: string;
  to: string;
  subject: string;
  bodyText?: string;
  bodyHtml?: string;
}): Promise<{ id: string }> {
  const res = await fetch(apiUrl("/api/emails/send"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Erro ao enviar e-mail.");
  return { id: data.id };
}
