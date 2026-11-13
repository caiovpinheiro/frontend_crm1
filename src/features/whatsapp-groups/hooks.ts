"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

import {
  getWhatsAppGroup,
  listWhatsAppGroupMessages,
  listWhatsAppGroups,
  markWhatsAppGroupRead,
  openWhatsAppGroupMember,
  sendWhatsAppGroupAttachment,
  sendWhatsAppGroupMessage,
  syncWhatsAppGroups,
} from "./api";
import { clearGroupUnread } from "./list-preview";
import type { WhatsAppGroupsListResponse } from "./types";
import {
  appendPendingMessage,
  dropPendingMessage,
  mergeServerMessages,
  optimisticGroupMessage,
  pendingAttachmentText,
  pendingAttachmentType,
  settlePendingMessage,
  type GroupMessagesCache,
} from "./thread";

export const whatsappGroupsKey = ["whatsapp-groups"] as const;

/** O POST só enfileira. O worker grava os grupos uns segundos depois. */
const SYNC_REFRESH_DELAYS_MS = [3_000, 8_000, 15_000, 30_000];

/**
 * Mensagens do grupo não têm evento SSE: é poll puro. 6 s era um GET a cada
 * 6 s por grupo aberto, aba oculta inclusive. 30 s visível, nada oculto.
 */
export const GROUP_MESSAGES_POLL_MS = 30_000;

/** Intervalo do poll das mensagens do grupo: só com grupo aberto e aba visível. */
export function groupMessagesPollInterval(
  hasGroup: boolean,
  visible: boolean,
): number | false {
  return hasGroup && visible ? GROUP_MESSAGES_POLL_MS : false;
}

/**
 * A lista também é poll: o grupo que recebeu mensagem sobe para o topo.
 * Mesmo ritmo das mensagens; nada com a aba oculta.
 */
export const GROUP_LIST_POLL_MS = 30_000;

export function groupListPollInterval(visible: boolean): number | false {
  return visible ? GROUP_LIST_POLL_MS : false;
}

export function useWhatsAppGroups() {
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: whatsappGroupsKey,
    queryFn: listWhatsAppGroups,
    staleTime: 8_000,
    refetchInterval: groupListPollInterval(visible),
    refetchIntervalInBackground: false,
  });
}

export function useWhatsAppGroup(id: string | null) {
  return useQuery({
    queryKey: [...whatsappGroupsKey, id],
    queryFn: () => getWhatsAppGroup(id!),
    enabled: Boolean(id),
    staleTime: 8_000,
  });
}

export function groupMessagesKey(id: string | null) {
  return [...whatsappGroupsKey, id, "messages"] as const;
}

export function useWhatsAppGroupMessages(id: string | null) {
  const visible = useDocumentVisible();
  const qc = useQueryClient();
  return useQuery({
    queryKey: groupMessagesKey(id),
    queryFn: async () => {
      const res = await listWhatsAppGroupMessages(id!);
      const prev = qc.getQueryData<GroupMessagesCache>(groupMessagesKey(id));
      return { messages: mergeServerMessages(res.messages, prev) };
    },
    enabled: Boolean(id),
    staleTime: 4_000,
    refetchInterval: groupMessagesPollInterval(Boolean(id), visible),
    refetchIntervalInBackground: false,
  });
}

export function useWhatsAppGroupMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: whatsappGroupsKey });
  /** Só a lista (o grupo sobe para o topo), sem refazer a conversa aberta. */
  const refreshList = () =>
    void qc.invalidateQueries({ queryKey: whatsappGroupsKey, exact: true });
  const refreshAfterSync = () => {
    invalidate();
    for (const delay of SYNC_REFRESH_DELAYS_MS) {
      setTimeout(invalidate, delay);
    }
  };

  return {
    sync: useMutation({
      mutationFn: syncWhatsAppGroups,
      onSuccess: refreshAfterSync,
    }),
    send: useMutation({
      mutationFn: ({ id, text }: { id: string; text: string }) =>
        sendWhatsAppGroupMessage(id, text),
      // A bolha aparece na hora; o POST só confirma (ou tira, se falhar).
      onMutate: async ({ id, text }) => {
        const key = groupMessagesKey(id);
        await qc.cancelQueries({ queryKey: key });
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        qc.setQueryData<GroupMessagesCache>(key, (cur) =>
          appendPendingMessage(cur, optimisticGroupMessage(text, tempId)),
        );
        return { tempId };
      },
      onSuccess: (data, vars, ctx) => {
        refreshList();
        if (!ctx) return;
        qc.setQueryData<GroupMessagesCache>(groupMessagesKey(vars.id), (cur) =>
          settlePendingMessage(cur, ctx.tempId, data.message),
        );
      },
      onError: (_err, vars, ctx) => {
        if (!ctx) return;
        qc.setQueryData<GroupMessagesCache>(groupMessagesKey(vars.id), (cur) =>
          dropPendingMessage(cur, ctx.tempId),
        );
      },
    }),
    sendAttachment: useMutation({
      mutationFn: ({ id, file, fileName, caption }: { id: string; file: Blob; fileName: string; caption?: string }) =>
        sendWhatsAppGroupAttachment(id, file, fileName, caption),
      onMutate: async ({ id, file, fileName }) => {
        const key = groupMessagesKey(id);
        await qc.cancelQueries({ queryKey: key });
        const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const messageType = pendingAttachmentType(file.type, fileName);
        qc.setQueryData<GroupMessagesCache>(key, (cur) =>
          appendPendingMessage(
            cur,
            optimisticGroupMessage(pendingAttachmentText(messageType, fileName), tempId, new Date(), {
              messageType,
              fileName,
            }),
          ),
        );
        return { tempId };
      },
      onSuccess: (data, vars, ctx) => {
        refreshList();
        if (!ctx) return;
        qc.setQueryData<GroupMessagesCache>(groupMessagesKey(vars.id), (cur) =>
          settlePendingMessage(cur, ctx.tempId, data.message),
        );
      },
      onError: (_err, vars, ctx) => {
        if (!ctx) return;
        qc.setQueryData<GroupMessagesCache>(groupMessagesKey(vars.id), (cur) =>
          dropPendingMessage(cur, ctx.tempId),
        );
      },
    }),
    // Some na hora da lista; o POST grava o "visto" para todos do número.
    markRead: useMutation({
      mutationFn: (id: string) => markWhatsAppGroupRead(id),
      onMutate: (id) => {
        qc.setQueryData<WhatsAppGroupsListResponse>(whatsappGroupsKey, (cur) => clearGroupUnread(cur, id));
      },
    }),
    openMember: useMutation({
      mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
        openWhatsAppGroupMember(groupId, memberId),
    }),
  };
}
