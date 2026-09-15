import { apiFetch, parseApiResponse } from "@/lib/api";

import type {
  WhatsAppGroupDetail,
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
  return json<{ ok: boolean }>(
    apiFetch(`/api/whatsapp-groups/${encodeURIComponent(id)}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    }),
    "Não foi possível enviar a mensagem.",
  );
}
