import { apiFetch, parseApiResponse } from "@/lib/api";

import type {
  GroupLinkItem,
  GroupMediaItem,
  GroupMediaSummary,
  WhatsAppGroupCompanyRef,
  WhatsAppGroupDetail,
  WhatsAppGroupMemberOpen,
  WhatsAppGroupMessage,
  WhatsAppGroupsListResponse,
} from "./types";

async function json<T>(res: Promise<Response>, fallback: string): Promise<T> {
  return parseApiResponse<T>(await res, fallback);
}

export function listWhatsAppGroups() {
  return json<WhatsAppGroupsListResponse>(
    apiFetch("/api/whatsapp-groups"),
    "Não foi possível carregar os grupos.",
  );
}

export function getWhatsAppGroup(id: string) {
  return json<{ group: WhatsAppGroupDetail }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}`),
    "Não foi possível carregar o grupo.",
  );
}

export function syncWhatsAppGroups() {
  return json<{ ok: boolean }>(
    apiFetch("/api/whatsapp-groups/sync", { method: "POST" }),
    "Não foi possível atualizar os grupos.",
  );
}

export function sendWhatsAppGroupMessage(id: string, text: string) {
  return json<{ ok: boolean; message?: WhatsAppGroupMessage | null }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
    "Não foi possível enviar a mensagem.",
  );
}

/** Anexo ou áudio gravado (multipart, como o anexo do inbox). */
export function sendWhatsAppGroupAttachment(
  id: string,
  file: Blob,
  fileName: string,
  caption?: string,
) {
  const form = new FormData();
  form.append("file", file, fileName);
  if (caption?.trim()) form.append("caption", caption.trim());
  return json<{ ok: boolean; message?: WhatsAppGroupMessage | null }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/attachments`, {
      method: "POST",
      body: form,
    }),
    "Não foi possível enviar o arquivo.",
  );
}

/** Abriu o grupo: zera as não lidas para todos que usam o número. */
export function markWhatsAppGroupRead(id: string) {
  return json<{ ok: boolean }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/read`, { method: "POST" }),
    "Não foi possível marcar o grupo como visto.",
  );
}

export function listWhatsAppGroupMessages(id: string) {
  return json<{ messages: WhatsAppGroupMessage[] }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/messages`),
    "Não foi possível carregar as mensagens.",
  );
}

export function openWhatsAppGroupMember(groupId: string, memberId: string) {
  return json<WhatsAppGroupMemberOpen>(
    apiFetch(
      `/api/whatsapp-groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(memberId)}/open`,
      { method: "POST" },
    ),
    "Não foi possível abrir este contato.",
  );
}

/** Totais + 3 fotos/vídeos recentes (painel "Dados do grupo"). */
export function getWhatsAppGroupMediaSummary(id: string) {
  return json<GroupMediaSummary>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/media?kind=summary`),
    "Não foi possível carregar as mídias do grupo.",
  );
}

/** Uma página da aba (mais recentes primeiro). `before` = data do último item. */
export function listWhatsAppGroupMedia(id: string, kind: "media" | "docs", before?: string | null) {
  const qs = new URLSearchParams({ kind });
  if (before) qs.set("before", before);
  return json<{ items: GroupMediaItem[] }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/media?${qs}`),
    "Não foi possível carregar as mídias do grupo.",
  );
}

export function listWhatsAppGroupLinks(id: string, before?: string | null) {
  const qs = new URLSearchParams({ kind: "links" });
  if (before) qs.set("before", before);
  return json<{ links: GroupLinkItem[] }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/media?${qs}`),
    "Não foi possível carregar os links do grupo.",
  );
}

/** Vincula, troca ou desvincula (null) a empresa do grupo. */
export function setWhatsAppGroupCompany(id: string, companyId: string | null) {
  return json<{ company: WhatsAppGroupCompanyRef | null }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/company`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId }),
    }),
    "Não foi possível vincular a empresa.",
  );
}
