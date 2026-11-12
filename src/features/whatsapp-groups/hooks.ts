"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useDocumentVisible } from "@/hooks/use-document-visible";

import {
  getWhatsAppGroup,
  listWhatsAppGroupMessages,
  listWhatsAppGroups,
  openWhatsAppGroupMember,
  sendWhatsAppGroupMessage,
  syncWhatsAppGroups,
} from "./api";
import {
  appendPendingMessage,
  dropPendingMessage,
  mergeServerMessages,
  optimisticGroupMessage,
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

export function useWhatsAppGroups() {
  return useQuery({
    queryKey: whatsappGroupsKey,
    queryFn: listWhatsAppGroups,
    staleTime: 8_000,
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
    openMember: useMutation({
      mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
        openWhatsAppGroupMember(groupId, memberId),
    }),
  };
}
