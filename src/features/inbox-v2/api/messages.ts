/*
 * Endpoints REST de mensagens da conversa ativa (chat).
 * Espelham as linhas 15-22, 28-31, 49-50 do contrato Fase 1.
 */

import { apiUrl, apiFetch, ApiError, parseApiResponse } from "@/lib/api";

import type {
  InboxMessageDto,
  MessagesResponse,
  ReactionDto,
  SessionInfo,
} from "./types";

/** GET /api/conversations/:id/session?channelId=X — janela de 24h do
 *  contato NO canal informado (o `session` do GET messages reflete só o
 *  canal da conversa). Alimenta o bloqueio do composer ao trocar de canal. */
export async function getChannelSession(
  conversationId: string,
  channelId: string,
): Promise<SessionInfo> {
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/session?channelId=${encodeURIComponent(channelId)}`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao consultar sessão do canal",
    );
  }
  return {
    active: data.active === true,
    lastInboundAt: data.lastInboundAt ?? null,
    expiresAt: data.expiresAt ?? null,
  };
}

/** GET /api/conversations/:id/messages
 *  Cold path: últimas N do ticket (sem history). Scroll-up usa `before`;
 *  tickets anteriores só com `history=1` quando o operador pede.
 */
export async function getMessages(
  conversationId: string,
  opts?: { history?: boolean; before?: string; limit?: number; budget?: number },
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (opts?.history === true) params.set("history", "1");
  if (opts?.before) params.set("before", opts.before);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.budget) params.set("budget", String(opts.budget));
  const q = params.size > 0 ? `?${params.toString()}` : "";
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/messages${q}`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao carregar mensagens",
    );
  }
  const messages: InboxMessageDto[] = Array.isArray(data.messages)
    ? data.messages
    : [];
  const requested = opts?.limit ?? 50;
  return {
    messages,
    hasMore:
      typeof data.hasMore === "boolean"
        ? data.hasMore
        : opts?.history !== true &&
          messages.filter((m) => m.messageType !== "ticket-separator").length >=
            requested,
    hasOlderTickets: data.hasOlderTickets === true,
    pinnedNoteId: data.pinnedNoteId ?? null,
    // Fixadas da conversa (várias, estilo WhatsApp). Aceita o array novo
    // (`pinnedMessageIds`) e cai no campo único legado (`pinnedMessageId`)
    // enquanto o backend não estiver atualizado em todos os ambientes.
    pinnedMessageIds: Array.isArray(data.pinnedMessageIds)
      ? data.pinnedMessageIds
      : data.pinnedMessageId
        ? [data.pinnedMessageId]
        : [],
    channelProvider: data.channelProvider ?? null,
    channel: data.channel ?? null,
    channels:
      data.channels && typeof data.channels === "object" ? data.channels : {},
    canReply: typeof data.canReply === "boolean" ? data.canReply : true,
    session: data.session ?? undefined,
  };
}

/** POST /api/conversations/:id/messages */
export async function sendMessage(
  conversationId: string,
  payload: {
    content: string;
    asNote?: boolean;
    replyToId?: string | null;
    /**
     * Override de canal: quando a org tem >1 WhatsApp conectado, o
     * composer permite escolher por qual número enviar. O backend valida
     * (org, tipo, status, scope) e usa o canal escolhido apenas nesta
     * mensagem (snapshot em `message.channelId`); o canal "atual" da
     * conversa não é alterado pelo override.
     */
    channelId?: string | null;
  },
): Promise<{ message: InboxMessageDto; metaError?: string }> {
  const body: Record<string, unknown> = payload.asNote
    ? { content: payload.content, messageType: "note", private: true }
    : { content: payload.content };
  if (payload.replyToId) body.replyToId = payload.replyToId;
  // Override só faz sentido fora do modo nota (notas internas não saem por canal).
  if (!payload.asNote && payload.channelId) body.channelId = payload.channelId;
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/messages`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parseApiResponse<{
    message: InboxMessageDto;
    metaError?: string;
    /** Id da conversa onde a mensagem foi de fato gravada. */
    conversationId?: string;
    /**
     * Presente quando a conversa estava ENCERRADA e o envio reabriu como
     * NOVO ticket (regra "reabrir = novo id"). O frontend deve trocar o
     * chat ativo para este id.
     */
    reopenedConversationId?: string;
  }>(res, "Erro ao enviar mensagem");
}

/** POST /api/conversations/:id/attachments — multipart/form-data */
export async function sendAttachment(
  conversationId: string,
  file: File | Blob,
  options?: {
    caption?: string;
    fileName?: string;
    /** Mesma semântica do `channelId` em `sendMessage` (override por mensagem). */
    channelId?: string | null;
  },
): Promise<{
  message: InboxMessageDto;
  reopenedConversationId?: string;
  audioDelivery?: "voice" | "audio" | "document";
}> {
  const form = new FormData();
  form.append(
    "file",
    file,
    options?.fileName ?? (file instanceof File ? file.name : "anexo.bin"),
  );
  if (options?.caption) form.append("caption", options.caption);
  if (options?.channelId) form.append("channelId", options.channelId);
  const res = await fetch(apiUrl(`/api/conversations/${conversationId}/attachments`), {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.message === "string" ? data.message : "Erro ao enviar anexo",
      res.status,
      typeof data?.code === "string" ? data.code : undefined,
    );
  }
  if (data.metaError) {
    throw new Error(
      `Salvo localmente, mas falhou via WhatsApp: ${data.metaError}`,
    );
  }
  return data as {
    message: InboxMessageDto;
    reopenedConversationId?: string;
    audioDelivery?: "voice" | "audio" | "document";
  };
}

/**
 * POST /api/conversations/:id/attachments — JSON `{ reuseUrl }`.
 * Reutiliza um arquivo já no storage da org (modelos / automation-media).
 * Não baixa nem reenvia bytes.
 */
export async function sendAttachmentReuse(
  conversationId: string,
  options: {
    reuseUrl: string;
    fileName?: string;
    mimeType?: string;
    caption?: string;
    channelId?: string | null;
  },
): Promise<{
  message: InboxMessageDto;
  reopenedConversationId?: string;
  audioDelivery?: "voice" | "audio" | "document";
}> {
  const res = await apiFetch(
    `/api/conversations/${conversationId}/attachments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reuseUrl: options.reuseUrl,
        ...(options.fileName ? { fileName: options.fileName } : {}),
        ...(options.mimeType ? { mimeType: options.mimeType } : {}),
        ...(options.caption ? { caption: options.caption } : {}),
        ...(options.channelId ? { channelId: options.channelId } : {}),
      }),
    },
    20_000,
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      typeof data?.message === "string" ? data.message : "Erro ao reutilizar anexo",
      res.status,
      typeof data?.code === "string" ? data.code : undefined,
    );
  }
  if (data.metaError) {
    throw new Error(
      `Salvo localmente, mas falhou via WhatsApp: ${data.metaError}`,
    );
  }
  return data as {
    message: InboxMessageDto;
    reopenedConversationId?: string;
    audioDelivery?: "voice" | "audio" | "document";
  };
}

/** POST /api/messages/:id/reactions */
export async function sendReaction(
  messageId: string,
  emoji: string,
): Promise<{ reactions?: ReactionDto[] }> {
  const res = await fetch(
    apiUrl(`/api/messages/${encodeURIComponent(messageId)}/reactions`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: unknown })?.message === "string"
        ? (data as { message: string }).message
        : "Nao foi possivel reagir",
    );
  }
  return data as { reactions?: ReactionDto[] };
}

/** POST /api/conversations/:targetId/forward */
export async function forwardMessage(params: {
  targetConversationId: string;
  sourceConversationId: string;
  messageRef: string;
}): Promise<{ metaError?: string }> {
  const res = await fetch(
    apiUrl(`/api/conversations/${params.targetConversationId}/forward`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceConversationId: params.sourceConversationId,
        messageRef: params.messageRef,
      }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao encaminhar",
    );
  }
  return data as { metaError?: string };
}

/** POST /api/conversations/:id/template */
export async function sendTemplate(
  conversationId: string,
  vars: {
    templateName: string;
    bodyPreview?: string;
    /** Idioma WABA (ex.: pt_BR). Evita listagem Meta no backend. */
    languageCode?: string | null;
    components?: unknown[];
    flowToken?: string | null;
    flowActionData?: Record<string, unknown> | null;
    templateGraphId?: string | null;
    /**
     * Override do canal de saída. Usado quando o canal original da conversa
     * está DISCONNECTED e o operador escolhe outro WhatsApp da mesma org.
     */
    channelId?: string | null;
  },
): Promise<{ message: InboxMessageDto; reopenedConversationId?: string }> {
  const body = JSON.stringify({
    templateName: vars.templateName,
    ...(vars.bodyPreview != null ? { bodyPreview: vars.bodyPreview } : {}),
    ...(vars.languageCode?.trim()
      ? { languageCode: vars.languageCode.trim() }
      : {}),
    ...(vars.components ? { components: vars.components } : {}),
    ...(vars.flowToken ? { flowToken: vars.flowToken } : {}),
    ...(vars.flowActionData && Object.keys(vars.flowActionData).length > 0
      ? { flowActionData: vars.flowActionData }
      : {}),
    ...(vars.templateGraphId ? { templateGraphId: vars.templateGraphId } : {}),
    ...(vars.channelId ? { channelId: vars.channelId } : {}),
  });

  const postOnce = () =>
    fetch(apiUrl(`/api/conversations/${conversationId}/template`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

  // 1 retry em 502/503/504 — cobre janela de redeploy do backend (proxy HTML).
  let res = await postOnce();
  if (res.status === 502 || res.status === 503 || res.status === 504) {
    await new Promise((r) => setTimeout(r, 800));
    res = await postOnce();
  }

  return parseApiResponse<{ message: InboxMessageDto; reopenedConversationId?: string }>(
    res,
    "Erro ao enviar template",
  );
}

/** POST /api/media/transcribe */
export async function transcribeMessage(messageId: string): Promise<{
  transcript: string;
}> {
  const res = await fetch(apiUrl("/api/media/transcribe"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof data?.message === "string" ? data.message : "Erro ao transcrever audio",
    );
  }
  return data as { transcript: string };
}

/** POST /api/ai-agents/drafts/:messageId/approve */
export async function approveAiDraft(messageId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/ai-agents/drafts/${messageId}/approve`), {
    method: "POST",
  });
  if (!res.ok) throw new Error("Falha ao aprovar rascunho");
}

/** POST /api/ai-agents/drafts/:messageId/discard */
export async function discardAiDraft(messageId: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/ai-agents/drafts/${messageId}/discard`), {
    method: "POST",
  });
  if (!res.ok) throw new Error("Falha ao descartar rascunho");
}

/**
 * PUT /api/conversations/:id/pin-note
 * noteId = null para desafixar.
 */
export async function pinNote(
  conversationId: string,
  noteId: string | null,
): Promise<{ id: string; pinnedNoteId: string | null }> {
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/pin-note`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noteId }),
    },
  );
  if (!res.ok) throw new Error("Falha ao fixar nota");
  return res.json();
}

/**
 * PUT /api/conversations/:id/pin-message
 * FIXA uma mensagem (várias por conversa, máx. 3 — estilo WhatsApp).
 * `durationHours` (24/168/720) define o prazo — omitido = sem prazo.
 * Diferente de `pinNote` — aceita qualquer mensagem, não só notas.
 */
export async function pinMessage(
  conversationId: string,
  messageId: string,
  durationHours?: number,
): Promise<{ ok: true }> {
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/pin-message`),
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        durationHours ? { messageId, durationHours } : { messageId },
      ),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: unknown })?.message === "string"
        ? (data as { message: string }).message
        : "Falha ao fixar mensagem",
    );
  }
  return data as { ok: true };
}

/**
 * DELETE /api/conversations/:id/pin-message
 * DESAFIXA uma mensagem específica (obrigatório o messageId, já que há
 * várias fixadas possíveis).
 */
export async function unpinMessage(
  conversationId: string,
  messageId: string,
): Promise<{ ok: true }> {
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/pin-message`),
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: unknown })?.message === "string"
        ? (data as { message: string }).message
        : "Falha ao desafixar mensagem",
    );
  }
  return data as { ok: true };
}

/**
 * GET /api/conversations/:id/favorites
 * Lista as mensagens favoritadas pelo agente logado nesta conversa —
 * alimenta o painel "Mensagens favoritas" no menu (⋮) do chat.
 */
export interface FavoriteMessageDto {
  id: string;
  content: string;
  createdAt: string;
  direction: "in" | "out" | "system";
  senderName: string | null;
}

export async function getFavoriteMessages(
  conversationId: string,
): Promise<FavoriteMessageDto[]> {
  const res = await fetch(
    apiUrl(`/api/conversations/${conversationId}/favorites`),
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: unknown })?.message === "string"
        ? (data as { message: string }).message
        : "Falha ao carregar favoritas",
    );
  }
  return Array.isArray((data as { items?: unknown })?.items)
    ? (data as { items: FavoriteMessageDto[] }).items
    : [];
}

/**
 * POST /api/messages/:id/favorite
 * Marcador PESSOAL do agente logado. `favorite` omitido = toggle.
 */
export async function favoriteMessage(
  messageId: string,
  favorite?: boolean,
): Promise<{ favorited: boolean }> {
  const res = await fetch(
    apiUrl(`/api/messages/${encodeURIComponent(messageId)}/favorite`),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(favorite === undefined ? {} : { favorite }),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      typeof (data as { message?: unknown })?.message === "string"
        ? (data as { message: string }).message
        : "Falha ao favoritar mensagem",
    );
  }
  return data as { favorited: boolean };
}

/**
 * POST /api/deals/:id/notes
 * Cria uma nota vinculada ao deal E dispara evento NOTE_ADDED na timeline.
 */
export async function addNoteToLog(
  dealId: string,
  content: string,
): Promise<{ id: string; content: string }> {
  const res = await fetch(apiUrl(`/api/deals/${dealId}/notes`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error("Falha ao adicionar nota ao log");
  return res.json();
}
