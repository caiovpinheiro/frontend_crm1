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

export const whatsappGroupsKey = ["whatsapp-groups"] as const;

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

export function useWhatsAppGroupMessages(id: string | null) {
  const visible = useDocumentVisible();
  return useQuery({
    queryKey: [...whatsappGroupsKey, id, "messages"],
    queryFn: () => listWhatsAppGroupMessages(id!),
    enabled: Boolean(id),
    staleTime: 4_000,
    refetchInterval: groupMessagesPollInterval(Boolean(id), visible),
    refetchIntervalInBackground: false,
  });
}

export function useWhatsAppGroupMutations() {
  const qc = useQueryClient();
  const invalidate = () => void qc.invalidateQueries({ queryKey: whatsappGroupsKey });

  return {
    sync: useMutation({
      mutationFn: syncWhatsAppGroups,
      onSuccess: invalidate,
    }),
    send: useMutation({
      mutationFn: ({ id, text }: { id: string; text: string }) =>
        sendWhatsAppGroupMessage(id, text),
      onSuccess: (_data, vars) => {
        void qc.invalidateQueries({ queryKey: [...whatsappGroupsKey, vars.id, "messages"] });
      },
    }),
    openMember: useMutation({
      mutationFn: ({ groupId, memberId }: { groupId: string; memberId: string }) =>
        openWhatsAppGroupMember(groupId, memberId),
    }),
  };
}
